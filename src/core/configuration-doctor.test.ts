import { describe, expect, it } from 'vitest';
import {
  configurationDoctorReport,
  validateConfigurationAvailabilityEvidence,
  type ConfigurationAvailabilityEvidence,
} from './configuration-doctor';
import {
  graphFromPobPerturbation,
  mergeBuildMechanicGraphs,
} from './build-mechanic-graph';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  type PobCalculationResult,
  type PobFlaskSlot,
  type PobPerturbationComparison,
} from './pob-calculation';

interface Values {
  totalDps?: number;
  armour?: number;
  effectiveHitPool?: number;
}

function result(requestId: string, scenario: 'mapping' | 'sustained-boss', values: Values): PobCalculationResult {
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
    scenario: { scenario },
    offence: { totalDps: values.totalDps },
    defence: {
      armour: values.armour,
      effectiveHitPool: values.effectiveHitPool,
    },
    warnings: [],
    elapsedMs: 1,
  };
}

function flaskComparison(
  requestId: string,
  scenario: 'mapping' | 'sustained-boss',
  slot: PobFlaskSlot,
  fromActive: boolean,
  before: Values,
  after: Values,
): PobPerturbationComparison {
  return {
    perturbations: [{ kind: 'toggle-flask', slot }],
    stateTransition: {
      kind: 'flask-active',
      slot,
      fromActive,
      toActive: !fromActive,
    },
    before: result(requestId, scenario, before),
    after: result(requestId, scenario, after),
  };
}

function evidence(
  id: string,
  conditionNodeId: string,
  label: ConfigurationAvailabilityEvidence['label'],
): ConfigurationAvailabilityEvidence {
  return {
    id,
    conditionNodeId,
    kind: 'reviewed-rule',
    label,
    confidence: 'high',
    source: `fixture:${id}`,
  };
}

describe('Configuration Doctor', () => {
  it('turns an active-to-inactive PoB flask delta into an explicit configured dependency', () => {
    const graph = graphFromPobPerturbation(flaskComparison(
      'flask-active',
      'mapping',
      'Flask 3',
      true,
      { totalDps: 1_200_000, armour: 30_000, effectiveHitPool: 70_000 },
      { totalDps: 1_000_000, armour: 20_000, effectiveHitPool: 60_000 },
    ));

    const report = configurationDoctorReport(graph);
    expect(report.dependencies).toHaveLength(1);
    expect(report.dependencies[0]).toMatchObject({
      conditionNodeId: 'condition:flask-active:Flask%203',
      slot: 'Flask 3',
      configuredActive: true,
      status: 'configured-dependent',
      availability: { labels: ['unproven'], evidence: [] },
    });

    const dps = report.dependencies[0].measuredImpacts.find((impact) => impact.metricId === 'total-dps');
    expect(dps).toMatchObject({
      scenario: 'mapping',
      activeValue: 1_200_000,
      inactiveValue: 1_000_000,
      activeAbsolute: 200_000,
    });
    expect(dps?.activePercentVsInactive).toBeCloseTo(20);

    const armour = report.dependencies[0].measuredImpacts.find((impact) => impact.metricId === 'armour');
    expect(armour?.activeAbsolute).toBe(10_000);
  });

  it('normalizes inactive-to-active comparisons into the same active contribution direction', () => {
    const graph = graphFromPobPerturbation(flaskComparison(
      'flask-inactive',
      'sustained-boss',
      'Flask 1',
      false,
      { totalDps: 800_000, armour: 10_000 },
      { totalDps: 1_000_000, armour: 15_000 },
    ));

    const dependency = configurationDoctorReport(graph).dependencies[0];
    expect(dependency.configuredActive).toBe(false);
    expect(dependency.status).toBe('inactive-sensitive');
    expect(dependency.measuredImpacts.find((impact) => impact.metricId === 'total-dps')).toMatchObject({
      activeValue: 1_000_000,
      inactiveValue: 800_000,
      activeAbsolute: 200_000,
    });
  });

  it('keeps uptime unproven until separate reviewed evidence supplies labels', () => {
    const graph = graphFromPobPerturbation(flaskComparison(
      'flask-evidence',
      'mapping',
      'Flask 2',
      true,
      { totalDps: 100, armour: 100 },
      { totalDps: 90, armour: 80 },
    ));
    const conditionNodeId = 'condition:flask-active:Flask%202';

    expect(configurationDoctorReport(graph).dependencies[0].availability.labels).toEqual(['unproven']);

    const reviewed = [
      evidence('mapping-uptime', conditionNodeId, 'mapping-credible'),
      evidence('cold-start', conditionNodeId, 'cold-start-unavailable'),
    ];
    const availability = configurationDoctorReport(graph, reviewed).dependencies[0].availability;
    expect(availability.labels).toEqual(['cold-start-unavailable', 'mapping-credible']);
    expect(availability.evidence.map((item) => item.id)).toEqual(['cold-start', 'mapping-uptime']);
    expect(availability.labels).not.toContain('boss-sustainable');
  });

  it('preserves scenario-specific measured impacts without converting them into uptime claims', () => {
    const mapping = graphFromPobPerturbation(flaskComparison(
      'mapping-flask',
      'mapping',
      'Flask 4',
      true,
      { totalDps: 1_000, armour: 200 },
      { totalDps: 900, armour: 150 },
    ));
    const boss = graphFromPobPerturbation(flaskComparison(
      'boss-flask',
      'sustained-boss',
      'Flask 4',
      true,
      { totalDps: 700, armour: 200 },
      { totalDps: 600, armour: 150 },
    ));

    const dependency = configurationDoctorReport(mergeBuildMechanicGraphs([mapping, boss])).dependencies[0];
    expect(dependency.measuredImpacts.map((impact) => impact.scenario)).toEqual(expect.arrayContaining(['mapping', 'sustained-boss']));
    expect(dependency.availability.labels).toEqual(['unproven']);
  });

  it('rejects contradictory availability claims instead of flattening them into one answer', () => {
    const graph = graphFromPobPerturbation(flaskComparison(
      'contradiction',
      'mapping',
      'Flask 5',
      true,
      { totalDps: 100 },
      { totalDps: 90 },
    ));
    const conditionNodeId = 'condition:flask-active:Flask%205';
    const claims = [
      evidence('permanent', conditionNodeId, 'permanent'),
      evidence('burst', conditionNodeId, 'burst-only'),
    ];

    expect(validateConfigurationAvailabilityEvidence(graph, claims).join('\n')).toMatch(/contradictory/);
    expect(() => configurationDoctorReport(graph, claims)).toThrow(/permanent conflicts with burst-only/);
  });

  it('rejects evidence for unknown conditions and evidence types outside the reviewed uptime allowlist', () => {
    const graph = graphFromPobPerturbation(flaskComparison(
      'bad-evidence',
      'mapping',
      'Flask 1',
      true,
      { totalDps: 100 },
      { totalDps: 80 },
    ));

    const unknown = evidence('unknown', 'condition:missing', 'mapping-credible');
    expect(validateConfigurationAvailabilityEvidence(graph, [unknown]).join('\n')).toMatch(/missing condition node/);

    const wrongKind = {
      ...evidence('pob-is-not-uptime', 'condition:flask-active:Flask%201', 'mapping-credible'),
      kind: 'pob-perturbation' as never,
    };
    expect(validateConfigurationAvailabilityEvidence(graph, [wrongKind]).join('\n')).toMatch(/unsupported evidence kind/);
  });

  it('fails closed when merged calculations disagree about the imported baseline active state', () => {
    const active = graphFromPobPerturbation(flaskComparison(
      'active-baseline',
      'mapping',
      'Flask 2',
      true,
      { totalDps: 100 },
      { totalDps: 90 },
    ));
    const inactive = graphFromPobPerturbation(flaskComparison(
      'inactive-baseline',
      'sustained-boss',
      'Flask 2',
      false,
      { totalDps: 90 },
      { totalDps: 100 },
    ));

    const merged = mergeBuildMechanicGraphs([active, inactive]);
    expect(() => configurationDoctorReport(merged)).toThrow(/conflicting imported active states/);
  });
});
