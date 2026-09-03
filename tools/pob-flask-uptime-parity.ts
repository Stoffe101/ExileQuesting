import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPobKernelRequest } from '../electron/services/pob-kernel-service';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  type PobFlaskUptimeEntry,
  type PobWorkerFlaskUptimeInspectionSuccess,
} from '../src/core/pob-calculation';

const REFERENCE_SENTINEL = '@@EXILEQUESTING_POB_FLASK_UPTIME_REFERENCE@@';
const POB_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
const EXPECTED_ADAPTER_VERSION = '0.6.0';
const PROCESS_TIMEOUT_MS = 45_000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

interface ReferenceFlaskUptime {
  slot: string;
  name: string;
  baseName: string;
  active: boolean;
  uptimeLine?: string;
}

interface ReferencePayload {
  flasks: ReferenceFlaskUptime[];
}

interface ParsedReferenceUptime {
  averagePercent: number;
  minimumPercent: number;
}

interface FixtureReport {
  fixture: string;
  equippedFlasks: number;
  supportedUptimeFlasks: number;
  unsupportedFlasks: number;
  comparedFields: number;
  passed: boolean;
}

const FIXTURES = [
  'spec/TestBuilds/3.13/OccVortex.xml',
  'spec/TestBuilds/3.13/Dual Wield Cospris CoC.xml',
  'spec/TestBuilds/3.13/Mirage Archer Toxic Rain.xml',
] as const;

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

function parseReferenceUptimeLine(line: string): ParsedReferenceUptime {
  const plain = line
    .replace(/\^x[0-9a-f]{6}/gi, '')
    .replace(/\^./g, '');

  const detailed = plain.match(/^Flask uptime:\s*(\d+)%\s*average,\s*(\d+)%\s*minimum$/);
  if (detailed) {
    const averagePercent = Number(detailed[1]);
    const minimumPercent = Number(detailed[2]);
    if (Number.isInteger(averagePercent) && Number.isInteger(minimumPercent)
      && averagePercent >= 0 && averagePercent <= 100
      && minimumPercent >= 0 && minimumPercent <= 100) {
      return { averagePercent, minimumPercent };
    }
  }

  const guaranteed = plain.match(/^Flask uptime:\s*(\d+)%$/);
  if (guaranteed && Number(guaranteed[1]) === 100) {
    return { averagePercent: 100, minimumPercent: 100 };
  }

  throw new Error(`Independent reference parser does not recognize pinned-PoB uptime line: ${JSON.stringify(line)}`);
}

async function runReference(
  pobRoot: string,
  runtimePath: string,
  referenceScriptPath: string,
  fixturePath: string,
): Promise<ReferencePayload> {
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
    let timer: NodeJS.Timeout;
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`${message}\n--- stdout tail ---\n${stdout.slice(-4_000)}\n--- stderr tail ---\n${stderr.slice(-4_000)}`));
    };

    timer = setTimeout(() => {
      child.kill();
      fail(`PoB flask uptime reference exceeded ${PROCESS_TIMEOUT_MS} ms.`);
    }, PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        fail('PoB flask uptime reference stdout exceeded the output bound.');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        fail('PoB flask uptime reference stderr exceeded the output bound.');
      }
    });
    child.on('error', (error) => fail(`PoB flask uptime reference failed to spawn: ${error.message}`));
    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      if (code !== 0) {
        fail(`PoB flask uptime reference exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`);
        return;
      }
      const line = stdout.split(/\r?\n/).findLast((candidate) => candidate.startsWith(REFERENCE_SENTINEL));
      if (!line) {
        fail('PoB flask uptime reference did not emit its sentinel payload.');
        return;
      }
      try {
        const payload = JSON.parse(line.slice(REFERENCE_SENTINEL.length)) as ReferencePayload;
        if (!payload || !Array.isArray(payload.flasks)) throw new Error('reference payload did not contain a flask array');
        settled = true;
        resolvePromise(payload);
      } catch (error) {
        fail(`PoB flask uptime reference payload failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
}

function requireWorkerUptimeResponse(value: unknown): PobWorkerFlaskUptimeInspectionSuccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Worker did not return an object response.');
  const response = value as Partial<PobWorkerFlaskUptimeInspectionSuccess>;
  if (response.ok !== true || !response.flaskUptimeInspection) throw new Error('Worker did not return flask uptime inspection data.');
  return response as PobWorkerFlaskUptimeInspectionSuccess;
}

function compareEntry(reference: ReferenceFlaskUptime, worker: PobFlaskUptimeEntry): number {
  let compared = 0;
  const equal = (label: string, actual: unknown, expected: unknown): void => {
    compared += 1;
    if (actual !== expected) throw new Error(`${reference.slot} ${label} mismatch: worker=${String(actual)}, reference=${String(expected)}.`);
  };

  equal('slot', worker.slot, reference.slot);
  equal('name', worker.name, reference.name);
  equal('base name', worker.baseName, reference.baseName);
  equal('active state', worker.active, reference.active);

  if (!reference.uptimeLine) {
    equal('supported state', worker.supported, false);
    if (worker.sourceLine !== undefined || worker.averagePercent !== undefined || worker.minimumPercent !== undefined) {
      throw new Error(`${reference.slot} emitted numerical/source uptime fields even though pinned PoB emitted no uptime line.`);
    }
    return compared + 3;
  }

  const parsed = parseReferenceUptimeLine(reference.uptimeLine);
  equal('supported state', worker.supported, true);
  equal('raw source line', worker.sourceLine, reference.uptimeLine);
  equal('average uptime', worker.averagePercent, parsed.averagePercent);
  equal('minimum uptime', worker.minimumPercent, parsed.minimumPercent);
  return compared;
}

async function main(): Promise<void> {
  const pobRootInput = process.env.POB_ROOT ?? process.argv[2];
  if (!pobRootInput) throw new Error('Set POB_ROOT before running flask uptime worker parity.');
  const pobRoot = resolve(pobRootInput);
  const runtimePath = process.env.POB_LUAJIT ?? process.argv[3] ?? 'luajit';
  const workerScriptPath = resolve(process.cwd(), 'tools/pob-kernel/worker.lua');
  const referenceScriptPath = resolve(process.cwd(), 'tools/pob-kernel/reference-flask-uptime.lua');

  const reports: FixtureReport[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`PoB flask uptime worker parity: ${fixture} ... `);
    const fixturePath = resolve(pobRoot, fixture);
    const xml = await readFile(fixturePath, 'utf8');
    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixturePath);
    const requestId = `uptime-parity-${fixture.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 120);
    const response = requireWorkerUptimeResponse(await runPobKernelRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId,
      operation: 'inspect-flask-uptime',
      xml,
      scenario: { scenario: 'imported', label: 'Pinned PoB flask uptime parity' },
    }, {
      runtimePath,
      pobSourcePath: resolve(pobRoot, 'src'),
      workerScriptPath,
      runtimeRevision: process.env.EXILEQUESTING_LUAJIT_COMMIT,
      timeoutMs: PROCESS_TIMEOUT_MS,
      maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES,
    }));

    const inspection = response.flaskUptimeInspection;
    if (inspection.kernel.pobCommit !== POB_COMMIT) throw new Error(`Worker PoB pin mismatch: ${inspection.kernel.pobCommit}`);
    if (inspection.kernel.adapterVersion !== EXPECTED_ADAPTER_VERSION) throw new Error(`Worker adapter mismatch: ${inspection.kernel.adapterVersion}`);
    if (inspection.source !== 'pob-items-tab-effective-flask-stats') throw new Error(`Unexpected uptime source: ${inspection.source}`);
    if (inspection.flasks.length !== reference.flasks.length) {
      throw new Error(`Equipped flask count mismatch: worker=${inspection.flasks.length}, reference=${reference.flasks.length}.`);
    }

    const workerBySlot = new Map(inspection.flasks.map((entry) => [entry.slot, entry]));
    let comparedFields = 0;
    let supportedUptimeFlasks = 0;
    for (const referenceEntry of reference.flasks) {
      const workerEntry = workerBySlot.get(referenceEntry.slot as PobFlaskUptimeEntry['slot']);
      if (!workerEntry) throw new Error(`Worker omitted equipped ${referenceEntry.slot}.`);
      comparedFields += compareEntry(referenceEntry, workerEntry);
      if (workerEntry.supported) supportedUptimeFlasks += 1;
    }

    const report: FixtureReport = {
      fixture,
      equippedFlasks: inspection.flasks.length,
      supportedUptimeFlasks,
      unsupportedFlasks: inspection.flasks.length - supportedUptimeFlasks,
      comparedFields,
      passed: true,
    };
    reports.push(report);
    console.log(`PASS (equipped=${report.equippedFlasks}, uptime=${supportedUptimeFlasks}, fields=${comparedFields})`);
  }

  const supported = reports.reduce((sum, report) => sum + report.supportedUptimeFlasks, 0);
  if (supported < 1) throw new Error('Pinned PoB fixtures did not exercise any supported flask uptime output.');

  const artifactDir = resolve(process.cwd(), 'artifacts', 'pob-kernel');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, 'flask-uptime-worker-parity.json');
  await writeFile(artifactPath, `${JSON.stringify({
    schemaVersion: 1,
    pobCommit: POB_COMMIT,
    adapterVersion: EXPECTED_ADAPTER_VERSION,
    oracle: 'independent raw ItemsTab tooltip capture + TypeScript parser',
    generatedAt: new Date().toISOString(),
    reports,
    passed: true,
  }, null, 2)}\n`, 'utf8');
  console.log(`PoB flask uptime worker parity PASS: supported=${supported}, report=${artifactPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
