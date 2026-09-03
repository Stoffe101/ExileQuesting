import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  parsePobWorkerProtocolLines,
  validPobCalculationRequest,
  type PobCalculationRequest,
  type PobWorkerFailure,
  type PobWorkerResponse,
} from '../../src/core/pob-calculation';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export interface PobKernelRuntimeOptions {
  runtimePath: string;
  pobSourcePath: string;
  workerScriptPath: string;
  luaModulePath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export class PobKernelWorkerError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly stdoutTail?: string;
  readonly stderrTail?: string;

  constructor(
    code: string,
    message: string,
    retryable: boolean,
    diagnostics?: { stdout?: string; stderr?: string },
  ) {
    super(message);
    this.name = 'PobKernelWorkerError';
    this.code = code;
    this.retryable = retryable;
    this.stdoutTail = diagnostics?.stdout?.slice(-4_000);
    this.stderrTail = diagnostics?.stderr?.slice(-4_000);
  }
}

function defaultLuaModulePath(pobSourcePath: string): string {
  const runtimeLua = resolve(pobSourcePath, '..', 'runtime', 'lua');
  return `${resolve(runtimeLua, '?.lua')};${resolve(runtimeLua, '?', 'init.lua')}`;
}

function workerFailureError(response: PobWorkerFailure, stdout: string, stderr: string): PobKernelWorkerError {
  return new PobKernelWorkerError(
    response.error.code,
    response.error.message,
    response.error.retryable,
    { stdout, stderr },
  );
}

export async function runPobKernelRequest(
  request: PobCalculationRequest,
  options: PobKernelRuntimeOptions,
): Promise<PobWorkerResponse> {
  if (!validPobCalculationRequest(request)) {
    throw new PobKernelWorkerError('invalid-request', 'PoB calculation request failed the ExileQuesting protocol bounds.', false);
  }
  if (!options.runtimePath.trim() || !options.pobSourcePath.trim() || !options.workerScriptPath.trim()) {
    throw new PobKernelWorkerError('runtime-config', 'PoB worker runtime, source and adapter paths are required.', false);
  }

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), 120_000);
  const maxOutputBytes = Math.min(Math.max(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 64 * 1024), 32 * 1024 * 1024);

  return await new Promise<PobWorkerResponse>((resolvePromise, rejectPromise) => {
    const child = spawn(options.runtimePath, [resolve(options.workerScriptPath)], {
      cwd: resolve(options.pobSourcePath),
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LUA_PATH: options.luaModulePath ?? defaultLuaModulePath(options.pobSourcePath),
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    };

    const timer = setTimeout(() => {
      child.kill();
      fail(new PobKernelWorkerError(
        'worker-timeout',
        `PoB calculation worker exceeded the ${timeoutMs} ms execution bound.`,
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
        fail(new PobKernelWorkerError('worker-output-limit', 'PoB worker stdout exceeded the configured output bound.', false, { stdout, stderr }));
      }
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > maxOutputBytes) {
        child.kill();
        fail(new PobKernelWorkerError('worker-output-limit', 'PoB worker stderr exceeded the configured output bound.', false, { stdout, stderr }));
      }
    });

    child.on('error', (error) => {
      fail(new PobKernelWorkerError('worker-spawn-failed', error.message, true, { stdout, stderr }));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      clearTimeout(timer);

      let responses: PobWorkerResponse[];
      try {
        responses = parsePobWorkerProtocolLines(stdout);
      } catch (error) {
        fail(new PobKernelWorkerError(
          'worker-protocol-json',
          error instanceof Error ? error.message : String(error),
          true,
          { stdout, stderr },
        ));
        return;
      }

      const response = [...responses].reverse().find((candidate) => candidate.requestId === request.requestId);
      if (!response) {
        fail(new PobKernelWorkerError(
          'worker-protocol-missing',
          `PoB worker exited without a protocol response for ${request.requestId} (exit=${code ?? 'null'}, signal=${signal ?? 'none'}).`,
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
          'worker-exit',
          `PoB worker returned a valid response but exited with code ${code ?? 'null'} (${signal ?? 'no signal'}).`,
          true,
          { stdout, stderr },
        ));
        return;
      }

      settled = true;
      resolvePromise(response);
    });

    child.stdin.on('error', (error) => {
      fail(new PobKernelWorkerError('worker-stdin', error.message, true, { stdout, stderr }));
    });

    child.stdin.end(`${JSON.stringify(request)}\n`, 'utf8');
  });
}
