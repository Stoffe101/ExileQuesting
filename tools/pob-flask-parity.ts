import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PobKernelWorkerError, runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_FLASK_SLOTS,
  type PobCalculationResult,
  type PobFlaskSlot,
  type PobWorkerPerturbationSuccess,
} from '../src/core/pob-calculation';

const POB_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
const LUAJIT_COMMIT = '2460b3ff93a1c955de3d62cfc825de7d68dc272e';
const ADAPTER_VERSION = '0.4.0';
const REFERENCE_SENTINEL = '@@EXILEQUESTING_POB_FLASK_REFERENCE@@';
const DEFAULT_RELATIVE_TOLERANCE = 1e-6;
const DEFAULT_ABSOLUTE_TOLERANCE = 0.05;
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

type RawOutput = Record<string, number>;

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

interface ReferenceToggle {
  slot: string;
  fromActive: boolean;
  toActive: boolean;
  before: RawOutput;
  after: RawOutput;
}

interface ReferencePayload {
  available: boolean;
  toggle?: ReferenceToggle;
}

interface FixtureReport {
  fixture: string;
  available: boolean;
  slot?: PobFlaskSlot;
  fromActive?: boolean;
  toActive?: boolean;
  beforeComparisons?: MetricComparison[];
  afterComparisons?: MetricComparison[];
  changedMetrics?: string[];
  stateTransitionPassed?: boolean;
  passed: boolean;
  elapsedMs?: number;
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

function luaModulePath(pobRoot: string): string {
  const paths = [
    resolve(pobRoot, 'src', '?.lua'),
    resolve(pobRoot, 'src', '?', 'init.lua'),
    resolve(pobRoot, 'runtime', 'lua', '?.lua'),
    resolve(pobRoot, 'runtime', 'lua', '?', 'init.lua'),
  ];
  if (process.env.LUA_PATH) paths.push(process.env.LUA_PATH);
  return paths.join(';');
}

async function runReference(
  pobRoot: string,
  runtimePath: string,
  referenceScriptPath: string,
  fixture: string,
): Promise<ReferencePayload> {
  const fixturePath = resolve(pobRoot, fixture);
  const cwd = resolve(pobRoot, 'src');

  return await new Promise<ReferencePayload>((resolvePromise, rejectPromise) => {
    const child = spawn(runtimePath, [referenceScriptPath, fixturePath], {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LUA_PATH: luaModulePath(pobRoot) },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`${message}\n--- reference stdout tail ---\n${stdout.slice(-4_000)}\n--- reference stderr tail ---\n${stderr.slice(-4_000)}`));
    };

    const timer = setTimeout(() => {
      child.kill();
      finishError(`PoB flask reference exceeded ${PROCESS_TIMEOUT_MS} ms.`);
    }, PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB flask reference stdout exceeded the output bound.');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB flask reference stderr exceeded the output bound.');
      }
    });
    child.on('error', (error) => finishError(`PoB flask reference failed to spawn: ${error.message}`));
    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        finishError(`PoB flask reference exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`);
        return;
      }
      const line = stdout.split(/\r?\n/).findLast((candidate) => candidate.startsWith(REFERENCE_SENTINEL));
      if (!line) {
        finishError('PoB flask reference did not emit its sentinel payload.');
        return;
      }
      try {
        const payload = JSON.parse(line.slice(REFERENCE_SENTINEL.length)) as ReferencePayload;
        if (!payload || typeof payload.available !== 'boolean') {
          finishError('PoB flask reference payload did not contain an availability flag.');
          return;
        }
        if (payload.available) {
          const toggle = payload.toggle;
          if (!toggle || typeof toggle.slot !== 'string'
            || typeof toggle.fromActive !== 'boolean' || typeof toggle.toActive !== 'boolean'
            || !toggle.before || typeof toggle.before !== 'object'
            || !toggle.after || typeof toggle.after !== 'object') {
            finishError('PoB flask reference payload did not contain a valid toggle oracle.');
            return;
          }
        }
        settled = true;
        resolvePromise(payload);
      } catch (error) {
        finishError(`PoB flask reference payload JSON failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
}

function comparisonTolerance(expected: number): number {
  return Math.max(DEFAULT_ABSOLUTE_TOLERANCE, Math.abs(expected) * DEFAULT_RELATIVE_TOLERANCE);
}

function compareRawToNormalized(raw: RawOutput, result: PobCalculationResult): MetricComparison[] {
  return METRICS.flatMap((check) => {
    const expected = raw[check.expectedStat];
    if (typeof expected !== 'number' || !Number.isFinite(expected)) return [];
    const actual = check.readActual(result);
    const tolerance = comparisonTolerance(expected);
    return [{
      label: check.label,
      expectedStat: check.expectedStat,
      expected,
      actual,
      tolerance,
      passed: actual !== undefined && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    }];
  });
}

function changedReferenceMetrics(before: RawOutput, after: RawOutput): string[] {
  return METRICS.flatMap((check) => {
    const beforeValue = before[check.expectedStat];
    const afterValue = after[check.expectedStat];
    if (typeof beforeValue !== 'number' || typeof afterValue !== 'number') return [];
    if (!Number.isFinite(beforeValue) || !Number.isFinite(afterValue)) return [];
    const tolerance = Math.max(comparisonTolerance(beforeValue), comparisonTolerance(afterValue));
    return Math.abs(afterValue - beforeValue) > tolerance ? [check.label] : [];
  });
}

function assertKernelProvenance(result: PobCalculationResult): void {
  if (result.kernel.pobCommit !== POB_COMMIT) {
    throw new Error(`Worker PoB pin ${result.kernel.pobCommit} does not match expected commit ${POB_COMMIT}.`);
  }
  if (result.kernel.runtimeRevision !== LUAJIT_COMMIT) {
    throw new Error(`Worker LuaJIT pin ${result.kernel.runtimeRevision} does not match expected commit ${LUAJIT_COMMIT}.`);
  }
  if (result.kernel.adapterVersion !== ADAPTER_VERSION) {
    throw new Error(`Worker adapter ${result.kernel.adapterVersion} does not match expected version ${ADAPTER_VERSION}.`);
  }
}

async function runFixture(
  pobRoot: string,
  runtimePath: string,
  workerScriptPath: string,
  referenceScriptPath: string,
  fixture: string,
): Promise<FixtureReport> {
  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);
  if (!reference.available) return { fixture, available: false, passed: true };

  const toggle = reference.toggle!;
  if (!POB_FLASK_SLOTS.includes(toggle.slot as PobFlaskSlot)) {
    throw new Error(`Reference selected unsupported flask slot ${toggle.slot} for ${fixture}.`);
  }
  const slot = toggle.slot as PobFlaskSlot;
  if (toggle.fromActive === toggle.toActive) {
    throw new Error(`Reference flask ${slot} did not describe a state transition for ${fixture}.`);
  }

  const xml = await readFile(resolve(pobRoot, fixture), 'utf8');
  const requestId = `flask-parity-${fixture.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 128);
  const response = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    operation: 'calculate-with-perturbations',
    xml,
    scenario: { scenario: 'imported', label: `PoB flask availability parity: ${fixture}` },
    perturbations: [{ kind: 'toggle-flask', slot }],
  }, {
    runtimePath,
    pobSourcePath: resolve(pobRoot, 'src'),
    workerScriptPath,
    timeoutMs: PROCESS_TIMEOUT_MS,
    maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES,
  });

  if (!response.ok || !('comparison' in response)) {
    throw new Error(`PoB worker returned a non-perturbation response for ${fixture} flask ${slot}.`);
  }
  const comparison = (response as PobWorkerPerturbationSuccess).comparison;
  assertKernelProvenance(comparison.before);
  assertKernelProvenance(comparison.after);

  const transition = comparison.stateTransition;
  const stateTransitionPassed = transition?.kind === 'flask-active'
    && transition.slot === slot
    && transition.fromActive === toggle.fromActive
    && transition.toActive === toggle.toActive;

  const beforeComparisons = compareRawToNormalized(toggle.before, comparison.before);
  const afterComparisons = compareRawToNormalized(toggle.after, comparison.after);
  if (beforeComparisons.length < 8 || afterComparisons.length < 8) {
    throw new Error(`${fixture} flask ${slot} exposed too few comparable metrics (before=${beforeComparisons.length}, after=${afterComparisons.length}).`);
  }
  const changedMetrics = changedReferenceMetrics(toggle.before, toggle.after);
  if (changedMetrics.length === 0) {
    throw new Error(`${fixture} flask ${slot} did not change a reviewed metric; the parity oracle would be vacuous.`);
  }

  return {
    fixture,
    available: true,
    slot,
    fromActive: toggle.fromActive,
    toActive: toggle.toActive,
    beforeComparisons,
    afterComparisons,
    changedMetrics,
    stateTransitionPassed,
    passed: stateTransitionPassed
      && beforeComparisons.every((metric) => metric.passed)
      && afterComparisons.every((metric) => metric.passed),
    elapsedMs: comparison.after.elapsedMs,
  };
}

function failedComparisons(report: FixtureReport): MetricComparison[] {
  return [
    ...(report.beforeComparisons ?? []),
    ...(report.afterComparisons ?? []),
  ].filter((comparison) => !comparison.passed);
}

async function main(): Promise<void> {
  const pobRootInput = process.env.POB_ROOT ?? process.argv[2];
  if (!pobRootInput) {
    throw new Error('Set POB_ROOT (or pass the PoB repository root as argv[2]) before running flask parity.');
  }
  const pobRoot = resolve(pobRootInput);
  const runtimePath = process.env.POB_LUAJIT ?? process.argv[3] ?? 'luajit';
  const workerScriptPath = resolve(process.cwd(), 'tools/pob-kernel/worker.lua');
  const referenceScriptPath = resolve(process.cwd(), 'tools/pob-kernel/reference-flask.lua');

  const reports: FixtureReport[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`PoB flask parity: ${fixture} ... `);
    const report = await runFixture(pobRoot, runtimePath, workerScriptPath, referenceScriptPath, fixture);
    reports.push(report);
    if (!report.available) {
      console.log('SKIP (no equipped flask with a reviewed measurable toggle)');
      continue;
    }
    console.log(report.passed
      ? `PASS (${report.slot} ${report.fromActive ? 'active' : 'inactive'} -> ${report.toActive ? 'active' : 'inactive'}, changed=${report.changedMetrics?.length ?? 0})`
      : 'FAIL');
    if (!report.stateTransitionPassed) console.error('  worker state transition did not match the independent PoB reference');
    for (const failed of failedComparisons(report)) {
      console.error(`  ${failed.label}: expected=${failed.expected} actual=${failed.actual ?? 'missing'} tolerance=${failed.tolerance}`);
    }
  }

  const tested = reports.filter((report) => report.available).length;
  const passed = tested > 0 && reports.every((report) => report.passed);
  const artifactDir = resolve(process.cwd(), 'artifacts', 'pob-kernel');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, 'flask-parity.json');
  await writeFile(artifactPath, `${JSON.stringify({
    schemaVersion: 1,
    pobCommit: POB_COMMIT,
    luaJitCommit: LUAJIT_COMMIT,
    adapterVersion: ADAPTER_VERSION,
    generatedAt: new Date().toISOString(),
    testedFixtures: tested,
    oracle: 'fresh pinned-PoB reversible toggleFlask reference process',
    reports,
    passed,
  }, null, 2)}\n`, 'utf8');

  console.log(`PoB flask parity ${passed ? 'PASS' : 'FAIL'}: ${tested}/${reports.length} fixtures exercised a measurable flask toggle, report=${artifactPath}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof PobKernelWorkerError) {
    console.error(`${error.name} [${error.code}]: ${error.message}`);
    if (error.stderrTail) console.error(`--- PoB stderr tail ---\n${error.stderrTail}`);
    if (error.stdoutTail) console.error(`--- PoB stdout tail ---\n${error.stdoutTail}`);
  } else {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }
  process.exitCode = 1;
});
