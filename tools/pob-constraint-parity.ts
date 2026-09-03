import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPobConstraintRequest } from '../electron/services/pob-constraint-service';
import type { PobKernelRuntimeOptions } from '../electron/services/pob-kernel-service';
import type { PobConstraintMetrics, PobReplaceableItemSlot } from '../src/core/pob-calculation';
import {
  POB_CONSTRAINT_PROTOCOL_VERSION,
  type PobConstraintWorkerSuccess,
} from '../src/core/pob-constraints';
import { POB_REPLACEABLE_ITEM_SLOTS } from '../src/core/pob-calculation';

const POB_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
const LUAJIT_COMMIT = '2460b3ff93a1c955de3d62cfc825de7d68dc272e';
const CONSTRAINT_ADAPTER_VERSION = 'constraint-0.1.0';
const REFERENCE_SENTINEL = '@@EXILEQUESTING_POB_CONSTRAINT_REFERENCE@@';
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;
const ABSOLUTE_TOLERANCE = 0.05;
const RELATIVE_TOLERANCE = 1e-6;

const FIXTURES = [
  'spec/TestBuilds/3.13/OccVortex.xml',
  'spec/TestBuilds/3.13/Dual Wield Cospris CoC.xml',
  'spec/TestBuilds/3.13/Mirage Archer Toxic Rain.xml',
] as const;

type RawOutput = Record<string, number | undefined>;

interface ReferencePayload {
  slot: string;
  itemText: string;
  before: RawOutput;
  after: RawOutput;
}

interface ConstraintCheck {
  label: string;
  rawKey: string;
  read: (metrics: PobConstraintMetrics) => number | undefined;
}

interface MetricComparison {
  label: string;
  rawKey: string;
  expected: number;
  actual?: number;
  tolerance: number;
  passed: boolean;
}

interface FixtureReport {
  fixture: string;
  slot: PobReplaceableItemSlot;
  before: MetricComparison[];
  after: MetricComparison[];
  kernel: { pobCommit: string; runtimeRevision: string; adapterVersion: string };
  passed: boolean;
}

const CHECKS: ConstraintCheck[] = [
  { label: 'Strength', rawKey: 'Str', read: (v) => v.attributes.strength.current },
  { label: 'Strength required', rawKey: 'ReqStr', read: (v) => v.attributes.strength.required },
  { label: 'Dexterity', rawKey: 'Dex', read: (v) => v.attributes.dexterity.current },
  { label: 'Dexterity required', rawKey: 'ReqDex', read: (v) => v.attributes.dexterity.required },
  { label: 'Intelligence', rawKey: 'Int', read: (v) => v.attributes.intelligence.current },
  { label: 'Intelligence required', rawKey: 'ReqInt', read: (v) => v.attributes.intelligence.required },
  { label: 'Mana unreserved', rawKey: 'ManaUnreserved', read: (v) => v.reservation.manaUnreserved },
  { label: 'Mana unreserved %', rawKey: 'ManaUnreservedPercent', read: (v) => v.reservation.manaUnreservedPercent },
  { label: 'Life unreserved', rawKey: 'LifeUnreserved', read: (v) => v.reservation.lifeUnreserved },
  { label: 'Life unreserved %', rawKey: 'LifeUnreservedPercent', read: (v) => v.reservation.lifeUnreservedPercent },
  { label: 'Suppression chance', rawKey: 'SpellSuppressionChance', read: (v) => v.spellSuppression.chance },
  { label: 'Effective suppression chance', rawKey: 'EffectiveSpellSuppressionChance', read: (v) => v.spellSuppression.effectiveChance },
  { label: 'Suppression overcap', rawKey: 'SpellSuppressionChanceOverCap', read: (v) => v.spellSuppression.overCap },
  { label: 'Suppression cap', rawKey: 'SuppressionChanceCap', read: (v) => v.spellSuppression.cap },
  { label: 'Fire resistance', rawKey: 'FireResist', read: (v) => v.resistances.fire.current },
  { label: 'Fire total resistance', rawKey: 'FireResistTotal', read: (v) => v.resistances.fire.total },
  { label: 'Fire overcap', rawKey: 'FireResistOverCap', read: (v) => v.resistances.fire.overCap },
  { label: 'Fire missing', rawKey: 'MissingFireResist', read: (v) => v.resistances.fire.missing },
  { label: 'Cold resistance', rawKey: 'ColdResist', read: (v) => v.resistances.cold.current },
  { label: 'Cold total resistance', rawKey: 'ColdResistTotal', read: (v) => v.resistances.cold.total },
  { label: 'Cold overcap', rawKey: 'ColdResistOverCap', read: (v) => v.resistances.cold.overCap },
  { label: 'Cold missing', rawKey: 'MissingColdResist', read: (v) => v.resistances.cold.missing },
  { label: 'Lightning resistance', rawKey: 'LightningResist', read: (v) => v.resistances.lightning.current },
  { label: 'Lightning total resistance', rawKey: 'LightningResistTotal', read: (v) => v.resistances.lightning.total },
  { label: 'Lightning overcap', rawKey: 'LightningResistOverCap', read: (v) => v.resistances.lightning.overCap },
  { label: 'Lightning missing', rawKey: 'MissingLightningResist', read: (v) => v.resistances.lightning.missing },
  { label: 'Chaos resistance', rawKey: 'ChaosResist', read: (v) => v.resistances.chaos.current },
  { label: 'Chaos total resistance', rawKey: 'ChaosResistTotal', read: (v) => v.resistances.chaos.total },
  { label: 'Chaos overcap', rawKey: 'ChaosResistOverCap', read: (v) => v.resistances.chaos.overCap },
  { label: 'Chaos missing', rawKey: 'MissingChaosResist', read: (v) => v.resistances.chaos.missing },
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

async function runReference(pobRoot: string, runtimePath: string, referenceScriptPath: string, fixture: string): Promise<ReferencePayload> {
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
      finishError(`PoB constraint reference exceeded ${PROCESS_TIMEOUT_MS} ms.`);
    }, PROCESS_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB constraint reference stdout exceeded the output bound.');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finishError('PoB constraint reference stderr exceeded the output bound.');
      }
    });
    child.on('error', (error) => finishError(`Could not start PoB constraint reference: ${error.message}`));
    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        finishError(`PoB constraint reference exited with code ${code ?? 'null'}.`);
        return;
      }
      const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith(REFERENCE_SENTINEL));
      if (!line) {
        finishError('PoB constraint reference did not emit its sentinel payload.');
        return;
      }
      settled = true;
      resolvePromise(JSON.parse(line.slice(REFERENCE_SENTINEL.length)) as ReferencePayload);
    });
  });
}

function tolerance(expected: number, actual: number | undefined): number {
  return Math.max(ABSOLUTE_TOLERANCE, Math.abs(expected) * RELATIVE_TOLERANCE, Math.abs(actual ?? 0) * RELATIVE_TOLERANCE);
}

function compare(raw: RawOutput, metrics: PobConstraintMetrics): MetricComparison[] {
  return CHECKS.flatMap((check) => {
    const expected = raw[check.rawKey];
    if (typeof expected !== 'number' || !Number.isFinite(expected)) return [];
    const actual = check.read(metrics);
    const allowed = tolerance(expected, actual);
    return [{
      label: check.label,
      rawKey: check.rawKey,
      expected,
      actual,
      tolerance: allowed,
      passed: typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= allowed,
    }];
  });
}

function validSlot(value: string): value is PobReplaceableItemSlot {
  return POB_REPLACEABLE_ITEM_SLOTS.includes(value as PobReplaceableItemSlot);
}

async function main(): Promise<void> {
  const pobRoot = process.env.POB_ROOT;
  const runtimePath = process.env.POB_LUAJIT;
  if (!pobRoot || !runtimePath) throw new Error('POB_ROOT and POB_LUAJIT must point at the exact pinned PoB checkout and LuaJIT runtime.');
  const actualRuntimeRevision = process.env.EXILEQUESTING_LUAJIT_COMMIT;
  if (actualRuntimeRevision !== LUAJIT_COMMIT) throw new Error(`LuaJIT provenance mismatch: expected ${LUAJIT_COMMIT}, got ${actualRuntimeRevision ?? 'missing'}.`);

  const referenceScriptPath = resolve('tools/pob-kernel/constraint-reference.lua');
  const workerScriptPath = resolve('tools/pob-kernel/constraint-worker.lua');
  const runtimeOptions: PobKernelRuntimeOptions = {
    runtimePath,
    pobSourcePath: resolve(pobRoot, 'src'),
    workerScriptPath,
    runtimeRevision: LUAJIT_COMMIT,
    timeoutMs: PROCESS_TIMEOUT_MS,
    maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES,
  };
  const reports: FixtureReport[] = [];

  for (const fixture of FIXTURES) {
    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);
    if (!validSlot(reference.slot)) throw new Error(`${fixture}: reference selected unsupported slot ${reference.slot}.`);
    const xml = await readFile(resolve(pobRoot, fixture), 'utf8');
    const response = await runPobConstraintRequest({
      protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
      requestId: `constraint-parity-${reports.length + 1}`,
      operation: 'compare-item-constraints',
      xml,
      slot: reference.slot,
      itemText: reference.itemText,
    }, runtimeOptions);
    if (!response.ok || !('comparison' in response)) throw new Error(`${fixture}: constraint worker did not return a comparison.`);
    const success = response as PobConstraintWorkerSuccess;
    if (success.comparison.slot !== reference.slot) throw new Error(`${fixture}: worker slot ${success.comparison.slot} differs from reference ${reference.slot}.`);
    if (success.kernel.pobCommit !== POB_COMMIT) throw new Error(`${fixture}: worker PoB pin mismatch ${success.kernel.pobCommit}.`);
    if (success.kernel.runtimeRevision !== LUAJIT_COMMIT) throw new Error(`${fixture}: worker LuaJIT pin mismatch ${success.kernel.runtimeRevision}.`);
    if (success.kernel.adapterVersion !== CONSTRAINT_ADAPTER_VERSION) throw new Error(`${fixture}: constraint adapter mismatch ${success.kernel.adapterVersion}.`);

    const before = compare(reference.before, success.comparison.before);
    const after = compare(reference.after, success.comparison.after);
    if (before.length < 18 || after.length < 18) throw new Error(`${fixture}: constraint parity exposed too few comparable raw fields (${before.length}/${after.length}).`);
    const passed = [...before, ...after].every((entry) => entry.passed);
    reports.push({
      fixture,
      slot: reference.slot,
      before,
      after,
      kernel: {
        pobCommit: success.kernel.pobCommit,
        runtimeRevision: success.kernel.runtimeRevision,
        adapterVersion: success.kernel.adapterVersion,
      },
      passed,
    });
  }

  const output = resolve('artifacts/pob-kernel/constraint-parity.json');
  await mkdir(resolve('artifacts/pob-kernel'), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    expectedSource: 'fresh pinned-PoB raw constraint output + independently discovered reversible item replacement',
    pobCommit: POB_COMMIT,
    luaJitCommit: LUAJIT_COMMIT,
    constraintAdapterVersion: CONSTRAINT_ADAPTER_VERSION,
    fixtures: reports,
    passed: reports.every((report) => report.passed),
  }, null, 2)}\n`, 'utf8');

  const failed = reports.flatMap((report) => [...report.before, ...report.after].filter((entry) => !entry.passed).map((entry) => `${report.fixture}: ${entry.label} expected ${entry.expected}, got ${entry.actual}`));
  if (failed.length) throw new Error(`PoB constraint parity failed:\n${failed.join('\n')}`);
  console.log(`PoB constraint parity PASS across ${reports.length} fixtures; report ${output}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
