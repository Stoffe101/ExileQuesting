import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { normalizeBuildProfiles, type BuildProfile } from '../../src/core/build-profiles';
import { defaultBuildPlannerState, normalizeBuildPlannerState, type BuildPlannerState } from '../../src/core/build-planner';
import { sanitizeRunTelemetry } from '../../src/core/run-intelligence';
import { normalizeProgressDocument, normalizeRewardDocument, normalizeRunDocument, normalizeSettingsDocument, parseBoundedJson, settingsDocument } from '../../src/core/persistence';
import type { AppSettings, ProgressHistoryEntry, RunHistoryEntry, RunSession } from '../../src/core/types';

const MAX_USER_JSON_BYTES = 4 * 1024 * 1024;

export class StateStore {
  private writeQueues = new Map<string, Promise<void>>();

  constructor(private root: string) {}

  path(name: string): string {
    return path.join(this.root, name);
  }

  async readUnknown(name: string): Promise<unknown> {
    const content = await fs.readFile(this.path(name), 'utf8');
    return parseBoundedJson(content, MAX_USER_JSON_BYTES);
  }

  async write(name: string, value: unknown): Promise<void> {
    const previous = this.writeQueues.get(name) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      const target = this.path(name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
      try {
        let lastError: unknown;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            await fs.rename(temporary, target);
            return;
          } catch (error) {
            lastError = error;
            const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(code) || attempt === 4) throw error;
            await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
          }
        }
        throw lastError;
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
      }
    });
    this.writeQueues.set(name, operation);
    try {
      await operation;
    } finally {
      if (this.writeQueues.get(name) === operation) this.writeQueues.delete(name);
    }
  }

  async loadSettings(defaults: AppSettings): Promise<AppSettings> {
    try { return normalizeSettingsDocument(await this.readUnknown('settings.json'), defaults); }
    catch { return structuredClone(defaults); }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.write('settings.json', settingsDocument(settings));
  }

  async loadProgress(maxStepIndex = Number.MAX_SAFE_INTEGER): Promise<{ progress: number; history: ProgressHistoryEntry[] }> {
    try { return normalizeProgressDocument(await this.readUnknown('progress.json'), maxStepIndex); }
    catch { return { progress: 0, history: [] }; }
  }

  async loadRun(): Promise<{ session: RunSession; history: RunHistoryEntry[] }> {
    try {
      const normalized = normalizeRunDocument(await this.readUnknown('run.json'));
      return sanitizeRunTelemetry(normalized.session, normalized.history);
    } catch {
      const fallback = normalizeRunDocument(undefined);
      return sanitizeRunTelemetry(fallback.session, fallback.history);
    }
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

  async loadBuildPlanner(profiles: BuildProfile[]): Promise<BuildPlannerState> {
    try { return normalizeBuildPlannerState(await this.readUnknown('build-planner.json'), profiles);
    } catch { return normalizeBuildPlannerState(defaultBuildPlannerState(), profiles); }
  }

  async saveBuildPlanner(state: BuildPlannerState, profiles: BuildProfile[]): Promise<void> {
    await this.write('build-planner.json', normalizeBuildPlannerState(state, profiles));
  }
}
