import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import {
  parsePobConstraintProtocolLines,
  validPobConstraintRequest,
  type PobConstraintRequest,
  type PobConstraintWorkerFailure,
  type PobConstraintWorkerResponse,
} from '../../src/core/pob-constraints';
import { PobKernelWorkerError, type PobKernelRuntimeOptions } from './pob-kernel-service';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function defaultLuaModulePath(pobSourcePath: string): string {
  const runtimeLua = resolve(pobSourcePath, '..', 'runtime', 'lua');
  const sourceModulePath = `${resolve(pobSourcePath, '?.lua')};${resolve(pobSourcePath, '?', 'init.lua')}`;
  const runtimeModulePath = `${resolve(runtimeLua, '?.lua')};${resolve(runtimeLua, '?', 'init.lua')}`;
  const pinnedPaths = `${sourceModulePath};${runtimeModulePath}`;
  return process.env.LUA_PATH ? `${pinnedPaths};${process.env.LUA_PATH}` : pinnedPaths;
}

function defaultLuaCModulePath(pobSourcePath: string): string | undefined {
  if (process.platform !== 'win32') return process.env.LUA_CPATH;
  const runtime = resolve(pobSourcePath, '..', 'runtime');
  const pinnedPaths = `${resolve(runtime, '?.dll')};${resolve(runtime, '?', '?.dll')}`;
  return process.env.LUA_CPATH ? `${pinnedPaths};${process.env.LUA_CPATH}` : pinnedPaths;
}

function workerFailureError(response: PobConstraintWorkerFailure, stdout: string, stderr: string): PobKernelWorkerError {
  return new PobKernelWorkerError(
    response.error.code,
    response.error.message,
    response.error.retryable,
    { stdout, stderr },
  );
}

export async function runPobConstraintRequest(
  request: PobConstraintRequest,
  options: PobKernelRuntimeOptions,
): Promise<PobConstraintWorkerResponse> {
  if (!validPobConstraintRequest(request)) {
    throw new PobKernelWorkerError('invalid-request', 'PoB constraint request failed the ExileQuesting protocol bounds.', false);
  }
  if (!options.runtimePath.trim() || !options.pobSourcePath.trim() || !options.workerScriptPath.trim()) {
    throw new PobKernelWorkerError('runtime-config', 'PoB constraint runtime, source and adapter paths are required.', false);
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), 120_000);
  const maxOutputBytes = Math.min(Math.max(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 64 * 1024), 32 * 1024 * 1024);
  const extraPath = (options.additionalPathEntries ?? []).map((entry) => resolve(entry)).filter(Boolean);
  const inheritedPath = process.env.PATH ?? '';
  const childPath = [...extraPath, inheritedPath].filter(Boolean).join(delimiter);
  const luaCModulePath = options.luaCModulePath ?? defaultLuaCModulePath(options.pobSourcePath);

  return await new Promise<PobConstraintWorkerResponse>((resolvePromise, rejectPromise) => {
    const child = spawn(options.runtimePath, [resolve(options.workerScriptPath)], {
      cwd: resolve(options.pobSourcePath),
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LUA_PATH: options.luaModulePath ?? defaultLuaModulePath(options.pobSourcePath),
        ...(luaCModulePath ? { LUA_CPATH: luaCModulePath } : {}),
        EXILEQUESTING_LUAJIT_COMMIT: options.runtimeRevision ?? process.env.EXILEQUESTING_LUAJIT_COMMIT,
        PATH: childPath,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      rejectPromise(error);
    };

    timer = setTimeout(() => {
      child.kill();
      fail(new PobKernelWorkerError(
        'constraint-worker-timeout',
        `PoB constraint worker exceeded the ${timeoutMs} ms execution bound.`,
        true,
        { stdout, stderr },
      ));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > maxOutputBytes) {
        child.kill();
        fail(new PobKernelWorkerError('constraint-worker-output-limit', 'PoB constraint worker stdout exceeded the configured output bound.', false, { stdout, stderr }));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > maxOutputBytes) {
        child.kill();
        fail(new PobKernelWorkerError('constraint-worker-output-limit', 'PoB constraint worker stderr exceeded the configured output bound.', false, { stdout, stderr }));
      }
    });
    child.on('error', (error) => {
      fail(new PobKernelWorkerError('constraint-worker-spawn-failed', error.message, true, { stdout, stderr }));
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);
      let responses: PobConstraintWorkerResponse[];
      try {
        responses = parsePobConstraintProtocolLines(stdout);
      } catch (error) {
        fail(new PobKernelWorkerError('constraint-worker-protocol-json', error instanceof Error ? error.message : String(error), true, { stdout, stderr }));
        return;
      }
      const response = [...responses].reverse().find((candidate) => candidate.requestId === request.requestId);
      if (!response) {
        fail(new PobKernelWorkerError(
          'constraint-worker-protocol-missing',
          `PoB constraint worker exited without a protocol response for ${request.requestId} (exit=${code ?? 'null'}, signal=${signal ?? 'none'}).`,
          true,
          { stdout, stderr },
        ));
        return;
      }
      if (!response.ok) {
        fail(workerFailureError(response, stdout, stderr));
        return;
      }
      if (code !== 0) {
        fail(new PobKernelWorkerError(
          'constraint-worker-exit',
          `PoB constraint worker returned a valid response but exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`,
          true,
          { stdout, stderr },
        ));
        return;
      }
      settled = true;
      resolvePromise(response);
    });
    child.stdin.on('error', (error) => {
      fail(new PobKernelWorkerError('constraint-worker-stdin', error.message, true, { stdout, stderr }));
    });
    child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
  });
}
