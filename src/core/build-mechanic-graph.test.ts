import { describe, expect, it } from 'vitest';
import {
  graphFromPobPerturbation,
  mergeBuildMechanicGraphs,
  validateBuildMechanicGraph,
  type BuildMechanicGraph,
} from './build-mechanic-graph';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  type PobCalculationResult,
  type PobPerturbation,
} from './pob-calculation';

interface ResultValues {
  totalDps?: number;
  effectiveHitPool?: number;
  physicalMaxHit?: number;
  speed?: number;
  critChance?: number;
  life?: number;
}

function result(requestId: string, scenario: 'mapping' | 'sustained-boss', values: ResultValues): PobCalculationResult {
  return {
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    kernel: {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
      pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
      runtime: 'LuaJIT',
      runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
      adapterVersion: '0.3.0',
    },
    scenario: { scenario },
    offence: {
      totalDps: values.totalDps,
      speed: values.speed,
      critChance: values.critChance,
    },
    defence: {
      life: values.life,
      effectiveHitPool: values.effectiveHitPool,
      maximumHit: { physical: values.physicalMaxHit },
    },
    warnings: [],
    elapsedMs: 1,
  };
}

function comparison(
  requestId: string,
  scenario: 'mapping' | 'sustained-boss',
  perturbation: PobPerturbation,
  before: ResultValues,
  after: ResultValues,
) {
  return {
    perturbations: [perturbation],
    before: result(requestId, scenario, before),
    after: result(requestId, scenario, after),
  };
}

describe('Build Doctor mechanic graph', () => {
  it('extracts only measured item responses and never stores copied item text', () => {
    const itemText = 'Rarity: RARE\nSecret Candidate\nIron Hat\n+99 to maximum Life';
    const graph = graphFromPobPerturbation(comparison(
      'item-map-1',
      'mapping',
      { kind: 'replace-item', slot: 'Helmet', itemText },
      { totalDps: 1_000_000, effectiveHitPool: 50_000, physicalMaxHit: 20_000, life: 4_000 },
      { totalDps: 1_100_000, effectiveHitPool: 55_000, physicalMaxHit: 20_000, life: 4_100 },
    ));

    expect(graph.evidence).toHaveLength(1);
    expect(graph.evidence[0]).toMatchObject({
      kind: 'pob-perturbation',
      confidence: 'verified',
      perturbation: { kind: 'replace-item', slot: 'Helmet' },
    });
    expect(graph.edges.every((edge) => edge.kind === 'observed-response')).toBe(true);
    expect(graph.edges.map((edge) => edge.to)).toEqual(expect.arrayContaining([
      'observable:total-dps',
      'observable:effective-hit-pool',
      'observable:life',
    ]));
    expect(graph.edges.some((edge) => edge.to === 'observable:physical-max-hit')).toBe(false);
    expect(JSON.stringify(graph)).not.toContain('Secret Candidate');
    expect(JSON.stringify(graph)).not.toContain('+99 to maximum Life');
  });

  it('records passive deallocation direction without pretending to know the causal mechanic', () => {
    const graph = graphFromPobPerturbation(comparison(
      'passive-remove',
      'sustained-boss',
      { kind: 'passive-node', operation: 'deallocate', nodeId: 42_001 },
      { totalDps: 2_000_000, critChance: 80, effectiveHitPool: 60_000 },
      { totalDps: 1_700_000, critChance: 72, effectiveHitPool: 60_000 },
    ));

    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: 'passive:42001', kind: 'passive' }));
    const dpsEdge = graph.edges.find((edge) => edge.to === 'observable:total-dps');
    expect(dpsEdge).toMatchObject({ kind: 'observed-response', from: 'passive:42001' });
    expect(dpsEdge?.observations?.[0]).toMatchObject({
      before: 2_000_000,
      after: 1_700_000,
      absolute: -300_000,
      direction: 'decrease',
    });
    expect(graph.evidence[0].perturbation).toEqual({ kind: 'passive-node', operation: 'deallocate', nodeId: 42_001 });
    expect(graph.edges.some((edge) => edge.kind === 'scales')).toBe(false);
  });

  it('merges repeated observations of the same passive response across scenarios', () => {
    const mapping = graphFromPobPerturbation(comparison(
      'passive-map',
      'mapping',
      { kind: 'passive-node', operation: 'deallocate', nodeId: 77 },
      { totalDps: 1_000, speed: 2 },
      { totalDps: 900, speed: 2 },
    ));
    const boss = graphFromPobPerturbation(comparison(
      'passive-boss',
      'sustained-boss',
      { kind: 'passive-node', operation: 'deallocate', nodeId: 77 },
      { totalDps: 800, speed: 2 },
      { totalDps: 680, speed: 2 },
    ));

    const merged = mergeBuildMechanicGraphs([mapping, boss]);
    const dpsEdges = merged.edges.filter((edge) => edge.from === 'passive:77' && edge.to === 'observable:total-dps');
    expect(dpsEdges).toHaveLength(1);
    expect(dpsEdges[0].evidenceIds).toHaveLength(2);
    expect(dpsEdges[0].observations).toHaveLength(2);
    expect(merged.evidence.map((entry) => entry.scenario)).toEqual(expect.arrayContaining(['mapping', 'sustained-boss']));
  });

  it('fails closed on mixed kernel provenance and unsupported perturbation placeholders', () => {
    const mixed = comparison(
      'mixed-kernel',
      'mapping',
      { kind: 'passive-node', operation: 'allocate', nodeId: 99 },
      { totalDps: 100 },
      { totalDps: 110 },
    );
    mixed.after.kernel = { ...mixed.after.kernel, pobCommit: 'different' };
    expect(() => graphFromPobPerturbation(mixed)).toThrow(/kernel provenance/);

    expect(() => graphFromPobPerturbation(comparison(
      'unsupported',
      'mapping',
      { kind: 'configuration', key: 'condition', value: true },
      { totalDps: 100 },
      { totalDps: 110 },
    ))).toThrow(/does not support configuration/);
  });

  it('rejects dangling graph edges and evidence-free claims', () => {
    const invalid: BuildMechanicGraph = {
      schemaVersion: 1,
      nodes: [{ id: 'passive:1', kind: 'passive', label: 'Passive 1' }],
      evidence: [],
      edges: [{
        id: 'bad-edge',
        from: 'passive:1',
        to: 'observable:missing',
        kind: 'scales',
        evidenceIds: [],
      }],
    };

    const validation = validateBuildMechanicGraph(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toMatch(/missing target node/);
    expect(validation.errors.join('\n')).toMatch(/has no evidence/);
  });
});
