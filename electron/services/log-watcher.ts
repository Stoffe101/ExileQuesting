import { promises as fs, watch as watchFileSystem, type FSWatcher, type Stats } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { latestZoneEvent, parseClientLogLine, parseLogTail } from '../../src/core/log-parser';
import { LogLineBuffer } from '../../src/core/log-stream';
import type { LogDiagnostics, ZoneEvent } from '../../src/core/types';

const POLL_MS = 1200;
const MAX_READ_CHUNK = 1024 * 1024;
const STARTUP_TAIL_BYTES = 512 * 1024;

export interface LogWatcherHooks {
  onEvent: (event: ZoneEvent) => void | Promise<void>;
  onDiagnostics: (diagnostics: LogDiagnostics) => void;
  onStartupZone?: (event: ZoneEvent | undefined) => void | Promise<void>;
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

function identityFor(stat: Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

export class PoELogWatcher {
  private watcher: FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private offset = 0;
  private decoder = new LogLineBuffer();
  private readChain: Promise<void> = Promise.resolve();
  private fileIdentity = '';
  private diagnostics: LogDiagnostics;

  constructor(private filePath: string, private hooks: LogWatcherHooks) {
    this.diagnostics = {
      path: filePath,
      fileExists: false,
      watcherActive: false,
      pollingActive: false,
    };
  }

  snapshot(): LogDiagnostics {
    return { ...this.diagnostics };
  }

  private emitDiagnostics(patch: Partial<LogDiagnostics> = {}): void {
    this.diagnostics = { ...this.diagnostics, ...patch };
    this.hooks.onDiagnostics(this.snapshot());
  }

  async start(): Promise<void> {
    await this.stop();
    try {
      const stat = await fs.stat(this.filePath);
      this.offset = stat.size;
      this.fileIdentity = identityFor(stat);
      this.decoder.reset();
      this.emitDiagnostics({ fileExists: true, lastError: undefined });
      await this.inspectStartupTail(stat.size);
      this.attachFsWatcher();
      this.pollTimer = setInterval(() => this.queueRead(true), POLL_MS);
      this.emitDiagnostics({ pollingActive: true });
      this.hooks.log?.info(`Watching Path of Exile log: ${this.filePath}`);
    } catch (error) {
      // Poll even if the configured file is temporarily unavailable. This lets
      // a game restart/recreation heal itself without requiring a settings edit.
      this.pollTimer = setInterval(() => this.queueRead(true), POLL_MS);
      this.emitDiagnostics({
        fileExists: false,
        watcherActive: false,
        pollingActive: true,
        lastError: error instanceof Error ? error.message : String(error),
      });
      this.hooks.log?.warn(`Configured log is unavailable: ${this.filePath}`, error);
    }
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    await this.readChain;
    this.emitDiagnostics({ watcherActive: false, pollingActive: false });
  }

  private attachFsWatcher(): void {
    this.watcher?.close();
    this.watcher = null;
    try {
      this.watcher = watchFileSystem(this.filePath, { persistent: false }, () => this.queueRead(false));
      this.watcher.on('error', (error) => {
        this.watcher?.close();
        this.watcher = null;
        this.emitDiagnostics({ watcherActive: false, lastError: error.message });
        this.hooks.log?.warn('Client.txt watcher error; polling fallback remains active.', error);
      });
      this.emitDiagnostics({ watcherActive: true, lastError: undefined });
    } catch (error) {
      this.watcher = null;
      this.emitDiagnostics({ watcherActive: false, lastError: error instanceof Error ? error.message : String(error) });
    }
  }

  private queueRead(fromPoll: boolean): void {
    this.readChain = this.readChain.then(() => this.consumeGrowth(fromPoll)).catch((error) => {
      this.emitDiagnostics({ lastError: error instanceof Error ? error.message : String(error) });
      this.hooks.log?.warn('Failed while reading Path of Exile log.', error);
    });
  }

  private async inspectStartupTail(size: number): Promise<void> {
    if (!size) {
      await this.hooks.onStartupZone?.(undefined);
      return;
    }
    const start = Math.max(0, size - STARTUP_TAIL_BYTES);
    const handle = await fs.open(this.filePath, 'r');
    try {
      const buffer = Buffer.alloc(size - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      const events = parseLogTail(buffer.subarray(0, bytesRead).toString('utf8'));
      const zone = latestZoneEvent(events);
      const level = [...events].reverse().find((event) => event.type === 'character-level')?.characterLevel;
      if (zone) {
        this.emitDiagnostics({
          lastAreaId: zone.areaId,
          lastAreaName: zone.areaName,
          areaLevel: zone.areaLevel,
          characterLevel: level,
          lastParsedEventAt: new Date().toISOString(),
          lastRawEvent: zone.raw,
        });
      } else if (level) {
        this.emitDiagnostics({ characterLevel: level });
      }
      await this.hooks.onStartupZone?.(zone);
    } finally {
      await handle.close();
    }
  }

  private resetForReplacement(stat: Stats, reason: string): void {
    this.offset = 0;
    this.fileIdentity = identityFor(stat);
    this.decoder.reset();
    this.hooks.log?.info(reason);
  }

  private async consumeGrowth(fromPoll: boolean): Promise<void> {
    let stat: Stats;
    try {
      stat = await fs.stat(this.filePath);
    } catch (error) {
      if (this.diagnostics.fileExists) {
        this.watcher?.close();
        this.watcher = null;
      }
      this.emitDiagnostics({ fileExists: false, watcherActive: false, lastError: error instanceof Error ? error.message : String(error) });
      return;
    }

    const identity = identityFor(stat);
    const reappeared = !this.diagnostics.fileExists;
    const replaced = Boolean(this.fileIdentity && identity !== this.fileIdentity);

    if (reappeared) {
      this.emitDiagnostics({ fileExists: true, lastError: undefined });
      this.resetForReplacement(stat, 'Path of Exile log became available again; reattaching from its current file.');
      this.attachFsWatcher();
    } else if (replaced) {
      this.resetForReplacement(stat, 'Path of Exile log file identity changed; treating it as a recreated log.');
      this.attachFsWatcher();
    } else if (stat.size < this.offset) {
      this.resetForReplacement(stat, 'Path of Exile log was truncated; reading from its new beginning.');
    }

    if (stat.size === this.offset) {
      if (fromPoll && !this.watcher) this.attachFsWatcher();
      return;
    }

    this.emitDiagnostics({ lastFileChangeAt: new Date().toISOString(), fileExists: true });
    const handle = await fs.open(this.filePath, 'r');
    try {
      let remaining = stat.size - this.offset;
      while (remaining > 0) {
        const readSize = Math.min(remaining, MAX_READ_CHUNK);
        const buffer = Buffer.alloc(readSize);
        const { bytesRead } = await handle.read(buffer, 0, readSize, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        remaining -= bytesRead;
        const lines = this.decoder.push(buffer.subarray(0, bytesRead).toString('utf8'));
        for (const line of lines) {
          const event = parseClientLogLine(line);
          if (!event) continue;
          this.emitDiagnostics({
            lastParsedEventAt: new Date().toISOString(),
            lastRawEvent: event.raw,
            lastAreaId: event.areaId ?? this.diagnostics.lastAreaId,
            lastAreaName: event.areaName ?? this.diagnostics.lastAreaName,
            areaLevel: event.areaLevel ?? this.diagnostics.areaLevel,
            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,
            lastError: undefined,
          });
          await this.hooks.onEvent(event);
        }
      }
    } finally {
      await handle.close();
    }

    if (fromPoll && !this.watcher) this.attachFsWatcher();
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export function steamRootsFromVdf(content: string): string[] {
  const roots: string[] = [];
  for (const match of content.matchAll(/"path"\s+"([^"]+)"/g)) roots.push(match[1].replace(/\\\\/g, '\\'));
  return roots;
}

export async function discoverSteamLibraries(): Promise<string[]> {
  const candidates = [
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Steam') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : '',
    path.join(os.homedir(), 'AppData', 'Local', 'Steam'),
  ].filter(Boolean);
  const libraries = new Set<string>();
  for (const root of candidates) {
    if (!(await exists(root))) continue;
    libraries.add(root);
    try {
      const vdf = await fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      steamRootsFromVdf(vdf).forEach((library) => libraries.add(library));
    } catch { /* optional */ }
  }
  return [...libraries];
}

export async function detectLogPath(): Promise<string> {
  const fileNames = ['LatestClient.txt', 'Client.txt'];
  const steamLibraries = await discoverSteamLibraries();
  const roots = new Set<string>([
    ...steamLibraries,
    process.env['ProgramFiles(x86)'] ?? '',
    process.env.ProgramFiles ?? '',
    'C:\\', 'D:\\', 'E:\\', 'F:\\', 'G:\\', 'H:\\',
  ].filter(Boolean));
  const relativeRoots = [
    path.join('steamapps', 'common', 'Path of Exile', 'logs'),
    path.join('Steam', 'steamapps', 'common', 'Path of Exile', 'logs'),
    path.join('SteamLibrary', 'steamapps', 'common', 'Path of Exile', 'logs'),
    path.join('Grinding Gear Games', 'Path of Exile', 'logs'),
    path.join('Path of Exile', 'logs'),
  ];
  for (const root of roots) {
    for (const relative of relativeRoots) {
      for (const fileName of fileNames) {
        const candidate = path.join(root, relative, fileName);
        if (await exists(candidate)) return candidate;
      }
    }
  }
  return '';
}
