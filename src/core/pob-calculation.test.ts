import { describe, expect, it } from 'vitest';
import {
  MAX_POB_PERTURBATION_ITEM_TEXT_BYTES,
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_WORKER_SENTINEL,
  calculationDelta,
  parsePobWorkerProtocolLines,
  perturbationEvaluation,
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
      runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
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

  it('derives an evaluation from complete before/after perturbation states', () => {
    const evaluation = perturbationEvaluation({
      perturbations: [{ kind: 'replace-item', slot: 'Helmet', itemText: 'Rarity: RARE\nTest\nIron Hat' }],
      before: result(5_000_000, 25_000, 60_000),
      after: result(5_500_000, 27_500, 63_000),
    });

    expect(evaluation.delta.totalDps.percent).toBeCloseTo(10);
    expect(evaluation.delta.maximumHit.physical.percent).toBeCloseTo(10);
    expect(evaluation.delta.effectiveHitPool.percent).toBeCloseTo(5);
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

  it('accepts a bounded item replacement in an enabled equipment slot', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'helmet-swap',
      operation: 'calculate-with-perturbations',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'sustained-boss' },
      perturbations: [{
        kind: 'replace-item',
        slot: 'Helmet',
        itemText: 'Rarity: RARE\nExileQuesting Test\nIron Hat',
      }],
    })).toBe(true);
  });

  it('rejects empty, oversized or unsupported replacement-item inputs', () => {
    const base = {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'bad-item',
      operation: 'calculate-with-perturbations' as const,
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'custom' as const },
    };

    expect(validPobCalculationRequest({
      ...base,
      perturbations: [{ kind: 'replace-item', slot: 'Helmet', itemText: '   ' }],
    })).toBe(false);
    expect(validPobCalculationRequest({
      ...base,
      perturbations: [{ kind: 'replace-item', slot: 'Helmet', itemText: 'x'.repeat(MAX_POB_PERTURBATION_ITEM_TEXT_BYTES + 1) }],
    })).toBe(false);
    expect(validPobCalculationRequest({
      ...base,
      perturbations: [{ kind: 'replace-item', slot: 'Flask 1' as never, itemText: 'Rarity: NORMAL\nSmall Life Flask' }],
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
      `${POB_WORKER_SENTINEL}{"protocolVersion":1,"requestId":"health","ok":true,"health":{"status":"ready","kernel":{"protocolVersion":1,"pobRepository":"PathOfBuildingCommunity/PathOfBuilding","pobCommit":"ed354c2f8c42e148bc904c7508dbe851fb2cf952","runtime":"LuaJIT","runtimeRevision":"2460b3ff93a1c955de3d62cfc825de7d68dc272e","adapterVersion":"0.2.0"}}}`,
      'more logs',
    ].join('\n');

    const messages = parsePobWorkerProtocolLines(stdout);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      requestId: 'health',
      ok: true,
      health: { kernel: { runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e' } },
    });
  });

  it('extracts perturbation comparison responses without losing before/after state', () => {
    const payload = {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'swap',
      ok: true,
      comparison: {
        perturbations: [{ kind: 'replace-item', slot: 'Helmet', itemText: 'Rarity: RARE\\nTest\\nIron Hat' }],
        before: result(100, 100, 100),
        after: result(110, 120, 130),
      },
    };
    const messages = parsePobWorkerProtocolLines(`${POB_WORKER_SENTINEL}${JSON.stringify(payload)}`);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      requestId: 'swap',
      ok: true,
      comparison: { before: { offence: { totalDps: 100 } }, after: { offence: { totalDps: 110 } } },
    });
  });

  it('surfaces malformed sentinel payloads instead of silently accepting corrupt IPC', () => {
    expect(() => parsePobWorkerProtocolLines(`${POB_WORKER_SENTINEL}{bad json}`)).toThrow();
  });
});
