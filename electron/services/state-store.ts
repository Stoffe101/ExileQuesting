import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeBuildProfiles, type BuildProfile } from '../../src/core/build-profiles';
import { normalizeProgressDocument, normalizeRewardDocument, normalizeRunDocument, normalizeSettingsDocument, parseBoundedJson } from '../../src/core/persistence';
import type { AppSettings, ProgressHistoryEntry, RunHistoryEntry, RunSession } from '../../src/core/types';

const MAX_USER_JSON_BYTES = 4 * 1024 * 1024;

export class StateStore {
  constructor(private root: string) {}

  path(name: string): string {
    return path.join(this.root, name);
  }

  async readUnknown(name: string): Promise<unknown> {
    const content = await fs.readFile(this.path(name), 'utf8');
    return parseBoundedJson(content, MAX_USER_JSON_BYTES);
  }

  async write(name: string, value: unknown): Promise<void> {
    const target = this.path(name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(temporary, target);
  }

  async loadSettings(defaults: AppSettings): Promise<AppSettings> {
    try { return normalizeSettingsDocument(await this.readUnknown('settings.json'), defaults); }
    catch { return structuredClone(defaults); }
  }

  async loadProgress(maxStepIndex = Number.MAX_SAFE_INTEGER): Promise<{ progress: number; history: ProgressHistoryEntry[] }> {
    try { return normalizeProgressDocument(await this.readUnknown('progress.json'), maxStepIndex); }
    catch { return { progress: 0, history: [] }; }
  }

  async loadRun(): Promise<{ session: RunSession; history: RunHistoryEntry[] }> {
    try { return normalizeRunDocument(await this.readUnknown('run.json')); }
    catch { return normalizeRunDocument(undefined); }
  }

  async loadRewards(allowedStepIds?: Set<string>): Promise<Set<string>> {
    try { return normalizeRewardDocument(await this.readUnknown('reward-audit.json'), allowedStepIds); }
    catch { return new Set(); }
  }

  async loadBuildProfiles(): Promise<BuildProfile[]> {
    try { return normalizeBuildProfiles(await this.readUnknown('build-profiles.json')); }
    catch { return []; }
  }

  async saveBuildProfiles(profiles: BuildProfile[]): Promise<void> {
    await this.write('build-profiles.json', normalizeBuildProfiles(profiles));
  }
}
