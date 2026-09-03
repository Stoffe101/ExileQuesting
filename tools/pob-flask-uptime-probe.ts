import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REFERENCE_SENTINEL = '@@EXILEQUESTING_POB_FLASK_UPTIME_REFERENCE@@';
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

interface ProbeReport {
  fixture: string;
  flasks: ReferenceFlaskUptime[];
  uptimeLines: number;
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
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`${message}\n--- stdout tail ---\n${stdout.slice(-4_000)}\n--- stderr tail ---\n${stderr.slice(-4_000)}`));
    };
    const timer = setTimeout(() => {
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
        if (!payload || !Array.isArray(payload.flasks)) {
          fail('PoB flask uptime reference payload did not contain a flask array.');
          return;
        }
        for (const flask of payload.flasks) {
          if (typeof flask.slot !== 'string' || typeof flask.baseName !== 'string' || typeof flask.active !== 'boolean') {
            fail('PoB flask uptime reference returned a malformed flask record.');
            return;
          }
          if (flask.uptimeLine !== undefined && !flask.uptimeLine.includes('Flask uptime:')) {
            fail(`PoB flask uptime reference returned an unexpected uptime line for ${flask.slot}.`);
            return;
          }
        }
        settled = true;
        resolvePromise(payload);
      } catch (error) {
        fail(`PoB flask uptime reference payload failed to parse: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  });
}

async function main(): Promise<void> {
  const pobRootInput = process.env.POB_ROOT ?? process.argv[2];
  if (!pobRootInput) throw new Error('Set POB_ROOT before running the flask uptime probe.');
  const pobRoot = resolve(pobRootInput);
  const runtimePath = process.env.POB_LUAJIT ?? process.argv[3] ?? 'luajit';
  const referenceScriptPath = resolve(process.cwd(), 'tools/pob-kernel/reference-flask-uptime.lua');

  const reports: ProbeReport[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`PoB direct flask uptime probe: ${fixture} ... `);
    const payload = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);
    const uptimeLines = payload.flasks.filter((flask) => flask.uptimeLine).length;
    const report = {
      fixture,
      flasks: payload.flasks,
      uptimeLines,
      passed: payload.flasks.length > 0,
    };
    reports.push(report);
    console.log(`PASS (flasks=${payload.flasks.length}, upstream-uptime-lines=${uptimeLines})`);
  }

  const totalFlasks = reports.reduce((sum, report) => sum + report.flasks.length, 0);
  const totalUptimeLines = reports.reduce((sum, report) => sum + report.uptimeLines, 0);
  const passed = reports.every((report) => report.passed) && totalFlasks > 0 && totalUptimeLines > 0;
  const artifactDir = resolve(process.cwd(), 'artifacts', 'pob-kernel');
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = resolve(artifactDir, 'flask-uptime-probe.json');
  await writeFile(artifactPath, `${JSON.stringify({
    schemaVersion: 1,
    source: 'direct pinned-PoB ItemsTab:AddItemStatDifferences fake-tooltip capture',
    generatedAt: new Date().toISOString(),
    reports,
    totalFlasks,
    totalUptimeLines,
    passed,
  }, null, 2)}\n`, 'utf8');

  console.log(`PoB direct flask uptime probe ${passed ? 'PASS' : 'FAIL'}: flasks=${totalFlasks}, uptime-lines=${totalUptimeLines}, report=${artifactPath}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
