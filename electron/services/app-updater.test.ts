import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdater } from './app-updater';

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function updater(currentVersion = '0.1.1') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-update-test-'));
  tempDirs.push(directory);
  return new AppUpdater({ repository: 'Stoffe101/ExileQuesting-Releases', currentVersion, updatesDirectory: directory, packaged: true, onState: () => undefined });
}

function release(version: string, bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  return {
    tag_name: `v${version}`, draft: false, prerelease: false, body: 'notes',
    assets: [{
      id: 1,
      name: `ExileQuesting-${version}-setup.exe`,
      size: bytes.byteLength,
      browser_download_url: `https://github.com/Stoffe101/ExileQuesting-Releases/releases/download/v${version}/ExileQuesting-${version}-setup.exe`,
      digest: `sha256:${digest}`,
      ...overrides,
    }],
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('AppUpdater failure simulation', () => {
  it('reports up-to-date without downloading', async () => {
    const bytes = new TextEncoder().encode('installer');
    globalThis.fetch = vi.fn(async () => jsonResponse(release('0.1.1', bytes))) as typeof fetch;
    expect((await (await updater()).check()).status).toBe('up-to-date');
  });

  it('detects a newer stable release and verifies a successful download', async () => {
    const bytes = new TextEncoder().encode('verified installer payload');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(release('0.1.2', bytes)))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 })) as typeof fetch;
    const service = await updater();
    expect((await service.check()).status).toBe('available');
    const state = await service.download();
    expect(state.status).toBe('ready');
    expect(state.progress).toBe(100);
  });

  it('rejects malformed release metadata and missing installers', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ tag_name: 'not-semver', assets: [] })) as typeof fetch;
    const state = await (await updater()).check();
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/valid ExileQuesting setup asset/i);
  });

  it('rejects a download whose byte count differs from GitHub metadata', async () => {
    const bytes = new TextEncoder().encode('abc');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(release('0.1.2', bytes, { size: 100 })))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 })) as typeof fetch;
    const service = await updater();
    await service.check();
    const state = await service.download();
    expect(state.status).toBe('error');
    expect(state.message).toMatch(/reported 100/i);
  });

  it('rejects a SHA-256 mismatch', async () => {
    const bytes = new TextEncoder().encode('abc');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(release('0.1.2', bytes, { digest: `sha256:${'0'.repeat(64)}` })))
      .mockResolvedValueOnce(new Response(bytes, { status: 200 })) as typeof fetch;
    const service = await updater();
    await service.check();
    expect((await service.download()).message).toMatch(/SHA-256/i);
  });

  it('recovers from release-feed and download network failures', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network offline'); }) as typeof fetch;
    expect((await (await updater()).check()).status).toBe('error');

    const bytes = new TextEncoder().encode('abc');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(release('0.1.2', bytes)))
      .mockRejectedValueOnce(new Error('connection reset')) as typeof fetch;
    const service = await updater();
    await service.check();
    expect((await service.download()).status).toBe('error');
  });

  it('handles a stream that fails part-way through and cleans up safely', async () => {
    const bytes = new TextEncoder().encode('abcdef');
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.error(new Error('stream interrupted'));
      },
    });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(release('0.1.2', bytes)))
      .mockResolvedValueOnce(new Response(broken, { status: 200 })) as typeof fetch;
    const service = await updater();
    await service.check();
    expect((await service.download()).status).toBe('error');
  });

  it('refuses installation before a verified update is ready', async () => {
    expect(await (await updater()).installOnExit()).toBe(false);
  });
});
