import { promises as fs } from 'node:fs';
import { reconcilePassivesCommand, type PassiveAuditBanditChoice, type PassivesReconciliation } from '../../src/core/passives-audit';

export const PASSIVES_LOG_TAIL_BYTES = 512 * 1024;

export async function readBoundedLogTail(filePath: string, maxBytes = PASSIVES_LOG_TAIL_BYTES): Promise<string> {
  if (!filePath.trim()) return '';
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('Configured Path of Exile log path is not a file.');
  const size = Math.min(stat.size, Math.max(1, maxBytes));
  if (!size) return '';
  const start = Math.max(0, stat.size - size);
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, start);
    let content = buffer.subarray(0, bytesRead).toString('utf8');
    if (start > 0) {
      const firstBreak = content.indexOf('\n');
      content = firstBreak >= 0 ? content.slice(firstBreak + 1) : '';
    }
    return content;
  } finally {
    await handle.close();
  }
}

export async function scanPassivesFromLog(filePath: string, bandit: PassiveAuditBanditChoice): Promise<PassivesReconciliation> {
  try {
    const content = await readBoundedLogTail(filePath);
    return reconcilePassivesCommand(content, bandit);
  } catch (error) {
    const fallback = reconcilePassivesCommand('', bandit);
    return {
      ...fallback,
      message: `Could not read the configured Path of Exile log: ${error instanceof Error ? error.message : String(error)}`,
      warnings: [...fallback.warnings, 'The scan is read-only and does not modify Client.txt. Check the configured log path in Settings.'],
    };
  }
}
