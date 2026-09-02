import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_PASSIVE_QUESTS } from '../../src/core/passives-audit';
import { readBoundedLogTail, scanPassivesFromLog } from './passives-audit-service';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function tempLog(content: string): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'eq-passives-'));
  temporary.push(folder);
  const file = path.join(folder, 'Client.txt');
  await writeFile(file, content, 'utf8');
  return file;
}

function report(quests = CAMPAIGN_PASSIVE_QUESTS, total = 24): string {
  return [
    `2026/09/02 21:10:01 1 abc [INFO Client 1] : ${total} Passive Skill Points from quests:`,
    ...quests.map((quest) => `2026/09/02 21:10:02 1 abc [INFO Client 1] : (${quest.points} from ${quest.name})`),
  ].join('\n');
}

describe('passives audit log service', () => {
  it('reads only a bounded tail and drops the first partial line', async () => {
    const file = await tempLog(`prefix-without-break${'x'.repeat(80)}\n${report()}`);
    const tail = await readBoundedLogTail(file, Buffer.byteLength(report()) + 8);
    expect(tail).toContain('24 Passive Skill Points from quests:');
    expect(tail).not.toContain('prefix-without-break');
  });

  it('reconciles the latest report directly from the configured log file', async () => {
    const file = await tempLog(`${'noise\n'.repeat(50)}${report()}`);
    const result = await scanPassivesFromLog(file, 'none');
    expect(result.status).toBe('complete');
    expect(result.earnedPoints).toBe(24);
  });

  it('passes the completed-act scope through to reconciliation', async () => {
    const quests = CAMPAIGN_PASSIVE_QUESTS.filter((quest) => quest.act <= 5);
    const file = await tempLog(report(quests, 10));
    const result = await scanPassivesFromLog(file, 'none', 5);
    expect(result.status).toBe('complete');
    expect(result.auditedThroughAct).toBe(5);
    expect(result.expectedQuestPoints).toBe(10);
    expect(result.items.find((item) => item.act === 6)?.status).toBe('future');
  });

  it('fails closed with a useful not-found result when the configured file is unavailable', async () => {
    const result = await scanPassivesFromLog('Z:/definitely/missing/Client.txt', 'none', 7);
    expect(result.status).toBe('not-found');
    expect(result.auditedThroughAct).toBe(7);
    expect(result.message).toContain('Could not read');
    expect(result.warnings[0]).toContain('read-only');
  });
});
