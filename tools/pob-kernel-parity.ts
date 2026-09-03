import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  type PobCalculationResult,
  type PobWorkerCalculationSuccess,
} from '../src/core/pob-calculation';

const POB_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
const DEFAULT_RELATIVE_TOLERANCE = 1e-6;
const DEFAULT_ABSOLUTE_TOLERANCE = 0.05;

interface MetricCheck {
  label: string;
  expectedStat: string;
  readActual: (result: PobCalculationResult) => number | undefined;
}

interface MetricComparison {
  label: string;
  expectedStat: string;
  expected: number;
  actual?: number;
  tolerance: number;
  passed: boolean;
}

interface FixtureReport {
  fixture: string;
  comparisons: MetricComparison[];
  passed: boolean;
  elapsedMs: number;
}

const FIXTURES = [
  'spec/TestBuilds/3.13/OccVortex.xml',
  'spec/TestBuilds/3.13/Dual Wield Cospris CoC.xml',
  'spec/TestBuilds/3.13/Mirage Archer Toxic Rain.xml',
] as const;

const METRICS: MetricCheck[] = [
  { label: 'Combined DPS', expectedStat: 'CombinedDPS', readActual: (result) => result.offence.combinedDps },
  { label: 'Hit DPS', expectedStat: 'TotalDPS', readActual: (result) => result.offence.hitDps },
  { label: 'Total DoT DPS', expectedStat: 'TotalDotDPS', readActual: (result) => result.offence.dotDps },
  { label: 'Average hit', expectedStat: 'AverageHit', readActual: (result) => result.offence.averageHit },
  { label: 'Life', expectedStat: 'Life', readActual: (result) => result.defence.life },
  { label: 'Energy Shield', expectedStat: 'EnergyShield', readActual: (result) => result.defence.energyShield },
  { label: 'Mana', expectedStat: 'Mana', readActual: (result) => result.defence.mana },
  { label: 'Ward', expectedStat: 'Ward', readActual: (result) => result.defence.ward },
  { label: 'Effective Hit Pool', expectedStat: 'TotalEHP', readActual: (result) => result.defence.effectiveHitPool },
  { label: 'Physical max hit', expectedStat: 'PhysicalMaximumHitTaken', readActual: (result) => result.defence.maximumHit?.physical },
  { label: 'Fire max hit', expectedStat: 'FireMaximumHitTaken', readActual: (result) => result.defence.maximumHit?.fire },
  { label: 'Cold max hit', expectedStat: 'ColdMaximumHitTaken', readActual: (result) => result.defence.maximumHit?.cold },
  { label: 'Lightning max hit', expectedStat: 'LightningMaximumHitTaken', readActual: (result) => result.defence.maximumHit?.lightning },
  { label: 'Chaos max hit', expectedStat: 'ChaosMaximumHitTaken', readActual: (result) => result.defence.maximumHit?.chaos },
  { label: 'Armour', expectedStat: 'Armour', readActual: (result) => result.defence.armour },
  { label: 'Evasion', expectedStat: 'Evasion', readActual: (result) => result.defence.evasion },
  { label: 'Spell suppression', expectedStat: 'EffectiveSpellSuppressionChance', readActual: (result) => result.defence.spellSuppressionChance },
  { label: 'Attack block', expectedStat: 'EffectiveBlockChance', readActual: (result) => result.defence.attackBlockChance },
  { label: 'Spell block', expectedStat: 'EffectiveSpellBlockChance', readActual: (result) => result.defence.spellBlockChance },
  { label: 'Fire resistance', expectedStat: 'FireResist', readActual: (result) => result.defence.fireResistance },
  { label: 'Cold resistance', expectedStat: 'ColdResist', readActual: (result) => result.defence.coldResistance },
  { label: 'Lightning resistance', expectedStat: 'LightningResist', readActual: (result) => result.defence.lightningResistance },
  { label: 'Chaos resistance', expectedStat: 'ChaosResist', readActual: (result) => result.defence.chaosResistance },
];

function xmlPlayerStats(xml: string): Map<string, number> {
  const stats = new Map<string, number>();
  for (const tag of xml.matchAll(/<PlayerStat\b[^>]*\/>/g)) {
    const attributes = new Map<string, string>();
    for (const attribute of tag[0].matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
      attributes.set(attribute[1], attribute[2]);
    }
    const stat = attributes.get('stat');
    const value = attributes.get('value');
    if (!stat || value === undefined) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) stats.set(stat, numeric);
  }
  return stats;
}

function comparisonTolerance(expected: number): number {
  return Math.max(DEFAULT_ABSOLUTE_TOLERANCE, Math.abs(expected) * DEFAULT_RELATIVE_TOLERANCE);
}

function compareMetric(check: MetricCheck, expected: number, actual: number | undefined): MetricComparison {
  const tolerance = comparisonTolerance(expected);
  return {
    label: check.label,
    expectedStat: check.expectedStat,
    expected,
    actual,
    tolerance,
    passed: actual !== undefined && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  };
}

async function runFixture(
  pobRoot: string,
  runtimePath: string,
  workerScriptPath: string,
  fixture: string,
): Promise<FixtureReport> {
  const xml = await readFile(resolve(pobRoot, fixture), 'utf8');
  const expected = xmlPlayerStats(xml);
  const requestId = `parity-${fixture.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 120);
  const response = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    operation: 'load-and-calculate',
    xml,
    scenario: { scenario: 'imported', label: `PoB upstream fixture: ${fixture}` },
  }, {
    runtimePath,
    pobSourcePath: resolve(pobRoot, 'src'),
    workerScriptPath,
    timeoutMs: 45_000,
    maxOutputBytes: 8 * 1024 * 1024,
  });

  if (!response.ok || !('result' in response)) {
    throw new Error(`PoB worker returned a non-calculation response for ${fixture}.`);
  }

  const result = (response as PobWorkerCalculationSuccess).result;
  if (result.kernel.pobCommit !== POB_COMMIT) {
    throw new Error(`Worker pin ${result.kernel.pobCommit} does not match expected PoB commit ${POB_COMMIT}.`);
  }

  const comparisons = METRICS.flatMap((check) => {
    const expectedValue = expected.get(check.expectedStat);
    if (expectedValue === undefined) return [];
    return [compareMetric(check, expectedValue, check.readActual(result))];
  });

  if (comparisons.length < 8) {
    throw new Error(`${fixture} exposed only ${comparisons.length} comparable normalized metrics; expected at least 8.`);
  }

  return {
    fixture,
    comparisons,
    passed: comparisons.every((comparison) => comparison.passed),
    elapsedMs: result.elapsedMs,
  };
}

async function main(): Promise<void> {
  const pobRootInput = process.env.POB_ROOT ?? process.argv[2];
  if (!pobRootInput) {
    throw new Error('Set POB_ROOT (or pass the PoB repository root as argv[2]) before running kernel parity.');
  }
  const pobRoot = resolve(pobRootInput);
  const runtimePath = process.env.POB_LUAJIT ?? process.argv[3] ?? 'luajit';
  const workerScriptPath = resolve(process.cwd(), 'tools/pob-kernel/worker.lua');

  const reports: FixtureReport[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`PoB parity: ${fixture} ... `);
    const report = await runFixture(pobRoot, runtimePath, workerScriptPath, fixture);
    reports.push(report);
    console.log(report.passed ? `PASS (${report.comparisons.length} metrics)` : 'FAIL');
    for (const failed of report.comparisons.filter((comparison) => !comparison.passed)) {
      console.error(`  ${failed.label}: expected=${failed.expected} actual=${failed.actual ?? 'missing'} tolerance=${failed.tolerance}`);
    }
  }

  const artifactDir = resolve(process.cwd(), 'artifacts', 'pob-kernel');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, 'parity.json');
  await writeFile(artifactPath, `${JSON.stringify({
    schemaVersion: 1,
    pobCommit: POB_COMMIT,
    generatedAt: new Date().toISOString(),
    runtimePath,
    reports,
    passed: reports.every((report) => report.passed),
  }, null, 2)}\n`, 'utf8');

  const passed = reports.every((report) => report.passed);
  console.log(`PoB kernel parity ${passed ? 'PASS' : 'FAIL'}: ${reports.length} fixtures, report=${artifactPath}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
