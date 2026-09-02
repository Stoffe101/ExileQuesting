import { app, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PassiveAuditBanditChoice } from '../../src/core/passives-audit';
import { MAX_SETTINGS_BYTES, migrateSettingsDocument, parseBoundedJson } from '../../src/core/persistence';
import { scanPassivesFromLog } from './passives-audit-service';

const BANDITS = new Set<PassiveAuditBanditChoice>(['none', 'alira', 'kraityn', 'oak']);

interface AuditSettings {
  logPath: string;
  bandit: PassiveAuditBanditChoice;
}

function sanitizeThroughAct(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(0, Math.min(10, Math.trunc(parsed)));
}

async function persistedAuditSettings(): Promise<AuditSettings> {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    const stat = await fs.stat(settingsPath);
    if (!stat.isFile() || stat.size > MAX_SETTINGS_BYTES) return { logPath: '', bandit: 'none' };
    const migrated = migrateSettingsDocument(parseBoundedJson(await fs.readFile(settingsPath, 'utf8'), MAX_SETTINGS_BYTES));
    const settings = migrated.settings;
    const logPath = typeof settings.logPath === 'string' && settings.logPath.length <= 4096 ? settings.logPath : '';
    const candidateBandit = String(settings.bandit ?? 'none') as PassiveAuditBanditChoice;
    return { logPath, bandit: BANDITS.has(candidateBandit) ? candidateBandit : 'none' };
  } catch {
    return { logPath: '', bandit: 'none' };
  }
}

export function registerPassivesAuditIpc(): void {
  ipcMain.handle('passives:scan', async (_event, throughAct: unknown) => {
    const settings = await persistedAuditSettings();
    return scanPassivesFromLog(settings.logPath, settings.bandit, sanitizeThroughAct(throughAct));
  });
}
