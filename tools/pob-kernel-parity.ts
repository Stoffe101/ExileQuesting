import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeCurrentParityFixture, POB_PARITY_FIXTURES } from './pob-kernel/current-parity-fixture';
import { PobKernelWorkerError, runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_REPLACEABLE_ITEM_SLOTS,
  type PobCalculationResult,
  type PobPassiveNodeOperation,
  type PobReplaceableItemSlot,
  type PobWorkerCalculationSuccess,
  type PobWorkerPerturbationSuccess,
} from '../src/core/pob-calculation';

const POB_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
const LUAJIT_COMMIT = '2460b3ff93a1c955de3d62cfc825de7d68dc272e';
const ADAPTER_VERSION = '0.7.0';
const REFERENCE_SENTINEL = '@@EXILEQUESTING_POB_REFERENCE@@';
const DEFAULT_RELATIVE_TOLERANCE = 1e-6;
const DEFAULT_ABSOLUTE_TOLERANCE = 0.05;
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

type RawOutput = Record<string, number | string | boolean>;

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

interface ItemReplacementReport {
  slot: PobReplaceableItemSlot;
  beforeComparisons: MetricComparison[];
  afterComparisons: MetricComparison[];
  changedMetrics: string[];
  passed: boolean;
}

interface PassiveNodeReport {
  operation: PobPassiveNodeOperation;
  nodeId: number;
  beforeComparisons: MetricComparison[];
  afterComparisons: MetricComparison[];
  changedMetrics: string[];
  passed: boolean;
}

interface FixtureReport {
  fixture: string;
  expectedSource: string;
  comparisons: MetricComparison[];
  itemReplacement: ItemReplacementReport;
  passiveNodes: PassiveNodeReport[];
  passed: boolean;
  elapsedMs: number;
}

interface ReferencePassiveNode {
  nodeId: number;
  before: RawOutput;
  after: RawOutput;
}

interface ReferencePayload {
  raw: RawOutput;
  itemReplacement: {
    slot: string;
    itemText: string;
    before: RawOutput;
    after: RawOutput;
  };
  passiveNodes: {
    allocate: ReferencePassiveNode;
    deallocate: ReferencePassiveNode;
  };
}

const FIXTURES = POB_PARITY_FIXTURES;

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
      env: {
        ...process.env,
        LUA_PATH: luaModulePath(pobRoot),
      },
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
      finishError(`PoB reference runner exceeded ${PROCESS_TIMEOUT_MS} ms.`);
    }, PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB reference stdout exceeded the output bound.');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB reference stderr exceeded the output bound.');
      }
    });
    child.on('error', (error) => finishError(`PoB reference runner failed to spawn: ${error.message}`));
    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        finishError(`PoB reference runner exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`);
        return;
      }
      const line = stdout.split(/\r?\n/).findLast((candidate) => candidate.startsWith(REFERENCE_SENTINEL));
      if (!line) {
        finishError('PoB reference runner did not emit its sentinel payload.');
        return;
      }
      try {
        const payload = JSON.parse(line.slice(REFERENCE_SENTINEL.length)) as ReferencePayload;
        if (!payload || typeof payload.raw !== 'object' || payload.raw === null) {
          finishError('PoB reference payload did not contain a raw output object.');
          return;
        }
        if (!payload.itemReplacement || typeof payload.itemReplacement.slot !== 'string' || typeof payload.itemReplacement.itemText !== 'string') {
          finishError('PoB reference payload did not contain an item-replacement oracle.');
          return;
        }
        if (!payload.passiveNodes
          || !Number.isSafeInteger(payload.passiveNodes.allocate?.nodeId)
          || !Number.isSafeInteger(payload.passiveNodes.deallocate?.nodeId)) {
          finishError('PoB reference payload did not contain both passive-node oracles.');
          return;
        }
        settled = true;
        resolvePromise(payload);
      } catch (error) {
        finishError(`PoB reference payload JSON failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
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

function compareRawToNormalized(raw: RawOutput, result: PobCalculationResult): MetricComparison[] {
  return METRICS.flatMap((check) => {
    const rawValue = raw[check.expectedStat];
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return [];
    return [compareMetric(check, rawValue, check.readActual(result))];
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

async function runPassiveNodeParity(
  xml: string,
  fixture: string,
  requestId: string,
  operation: PobPassiveNodeOperation,
  reference: ReferencePassiveNode,
  runtimeOptions: Parameters<typeof runPobKernelRequest>[1],
): Promise<{ report: PassiveNodeReport; elapsedMs: number }> {
  const response = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: `${requestId}-passive-${operation}`.slice(0, 128),
    operation: 'calculate-with-perturbations',
    xml,
    scenario: { scenario: 'imported', label: `PoB passive ${operation} parity: ${fixture}` },
    perturbations: [{ kind: 'passive-node', operation, nodeId: reference.nodeId }],
  }, runtimeOptions);

  if (!response.ok || !('comparison' in response)) {
    throw new Error(`PoB worker returned a non-perturbation response for ${fixture} passive ${operation}.`);
  }
  const comparison = (response as PobWorkerPerturbationSuccess).comparison;
  assertKernelProvenance(comparison.before);
  assertKernelProvenance(comparison.after);

  const beforeComparisons = compareRawToNormalized(reference.before, comparison.before);
  const afterComparisons = compareRawToNormalized(reference.after, comparison.after);
  if (beforeComparisons.length < 8 || afterComparisons.length < 8) {
    throw new Error(`${fixture} passive ${operation} exposed too few comparable metrics (before=${beforeComparisons.length}, after=${afterComparisons.length}).`);
  }

  const changedMetrics = changedReferenceMetrics(reference.before, reference.after);
  if (changedMetrics.length === 0) {
    throw new Error(`${fixture} passive ${operation} node ${reference.nodeId} did not change any reviewed metric; the sensitivity fixture would be vacuous.`);
  }

  return {
    report: {
      operation,
      nodeId: reference.nodeId,
      beforeComparisons,
      afterComparisons,
      changedMetrics,
      passed: beforeComparisons.every((metric) => metric.passed) && afterComparisons.every((metric) => metric.passed),
    },
    elapsedMs: comparison.after.elapsedMs,
  };
}

async function runFixture(
  pobRoot: string,
  runtimePath: string,
  workerScriptPath: string,
  referenceScriptPath: string,
  fixture: string,
): Promise<FixtureReport> {
  const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);
  const xml = currentFixture.xml;
  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.relativePath);
  if (!POB_REPLACEABLE_ITEM_SLOTS.includes(reference.itemReplacement.slot as PobReplaceableItemSlot)) {
    throw new Error(`Reference selected unsupported replacement slot ${reference.itemReplacement.slot} for ${fixture}.`);
  }
  const replacementSlot = reference.itemReplacement.slot as PobReplaceableItemSlot;
  const runtimeOptions = {
    runtimePath,
    pobSourcePath: resolve(pobRoot, 'src'),
    workerScriptPath,
    timeoutMs: PROCESS_TIMEOUT_MS,
    maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES,
  };

  const requestId = `parity-${fixture.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 120);
  const response = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    operation: 'load-and-calculate',
    xml,
    scenario: { scenario: 'imported', label: `PoB upstream fixture: ${fixture}` },
  }, runtimeOptions);

  if (!response.ok || !('result' in response)) {
    throw new Error(`PoB worker returned a non-calculation response for ${fixture}.`);
  }

  const result = (response as PobWorkerCalculationSuccess).result;
  assertKernelProvenance(result);
  const comparisons = compareRawToNormalized(reference.raw, result);
  if (comparisons.length < 8) {
    throw new Error(`${fixture} exposed only ${comparisons.length} comparable normalized metrics; expected at least 8.`);
  }

  const perturbationResponse = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: `${requestId}-item`.slice(0, 128),
    operation: 'calculate-with-perturbations',
    xml,
    scenario: { scenario: 'imported', label: `PoB item replacement parity: ${fixture}` },
    perturbations: [{
      kind: 'replace-item',
      slot: replacementSlot,
      itemText: reference.itemReplacement.itemText,
    }],
  }, runtimeOptions);

  if (!perturbationResponse.ok || !('comparison' in perturbationResponse)) {
    throw new Error(`PoB worker returned a non-perturbation response for ${fixture}.`);
  }
  const perturbation = (perturbationResponse as PobWorkerPerturbationSuccess).comparison;
  assertKernelProvenance(perturbation.before);
  assertKernelProvenance(perturbation.after);

  const beforeComparisons = compareRawToNormalized(reference.itemReplacement.before, perturbation.before);
  const afterComparisons = compareRawToNormalized(reference.itemReplacement.after, perturbation.after);
  if (beforeComparisons.length < 8 || afterComparisons.length < 8) {
    throw new Error(`${fixture} item replacement exposed too few comparable metrics (before=${beforeComparisons.length}, after=${afterComparisons.length}).`);
  }

  const changedMetrics = changedReferenceMetrics(reference.itemReplacement.before, reference.itemReplacement.after);
  if (changedMetrics.length === 0) {
    throw new Error(`${fixture} blank ${replacementSlot} replacement did not change any reviewed metric; the sensitivity fixture would be vacuous.`);
  }

  const itemReplacement: ItemReplacementReport = {
    slot: replacementSlot,
    beforeComparisons,
    afterComparisons,
    changedMetrics,
    passed: beforeComparisons.every((comparison) => comparison.passed)
      && afterComparisons.every((comparison) => comparison.passed),
  };

  const passiveNodes: PassiveNodeReport[] = [];
  let passiveElapsedMs = 0;
  for (const operation of ['deallocate', 'allocate'] as const) {
    const passive = await runPassiveNodeParity(
      xml,
      fixture,
      requestId,
      operation,
      reference.passiveNodes[operation],
      runtimeOptions,
    );
    passiveNodes.push(passive.report);
    passiveElapsedMs += passive.elapsedMs;
  }

  return {
    fixture,
    expectedSource: 'fresh pinned-PoB mainOutput + reversible misc-calculator reference process',
    comparisons,
    itemReplacement,
    passiveNodes,
    passed: comparisons.every((comparison) => comparison.passed)
      && itemReplacement.passed
      && passiveNodes.every((passive) => passive.passed),
    elapsedMs: result.elapsedMs + perturbation.after.elapsedMs + passiveElapsedMs,
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
  const referenceScriptPath = resolve(process.cwd(), 'tools/pob-kernel/reference.lua');

  const reports: FixtureReport[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`PoB parity: ${fixture} ... `);
    const report = await runFixture(pobRoot, runtimePath, workerScriptPath, referenceScriptPath, fixture);
    reports.push(report);
    const passiveChanged = report.passiveNodes.reduce((sum, passive) => sum + passive.changedMetrics.length, 0);
    console.log(report.passed
      ? `PASS (${report.comparisons.length} base metrics, ${report.itemReplacement.afterComparisons.length} replacement metrics, item-changed=${report.itemReplacement.changedMetrics.length}, passive-changed=${passiveChanged})`
      : 'FAIL');
    for (const failed of [
      ...report.comparisons,
      ...report.itemReplacement.beforeComparisons,
      ...report.itemReplacement.afterComparisons,
      ...report.passiveNodes.flatMap((passive) => [...passive.beforeComparisons, ...passive.afterComparisons]),
    ].filter((comparison) => !comparison.passed)) {
      console.error(`  ${failed.label}: expected=${failed.expected} actual=${failed.actual ?? 'missing'} tolerance=${failed.tolerance}`);
    }
  }

  const artifactDir = resolve(process.cwd(), 'artifacts', 'pob-kernel');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, 'parity.json');
  await writeFile(artifactPath, `${JSON.stringify({
    schemaVersion: 4,
    pobCommit: POB_COMMIT,
    luaJitCommit: LUAJIT_COMMIT,
    adapterVersion: ADAPTER_VERSION,
    generatedAt: new Date().toISOString(),
    runtimePath,
    oracle: 'fresh pinned-PoB mainOutput + reversible misc-calculator reference process',
    reports,
    passed: reports.every((report) => report.passed),
  }, null, 2)}\n`, 'utf8');

  const passed = reports.every((report) => report.passed);
  console.log(`PoB kernel parity ${passed ? 'PASS' : 'FAIL'}: ${reports.length} fixtures, report=${artifactPath}`);
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