import { describe, expect, it } from 'vitest';
import { deterministicChunks, replayClientLogChunks } from './log-replay';
import { appendHistory, makeHistoryEntry } from './progression';
import { appendRunHistory } from './run';
import type { CampaignStep, RunHistoryEntry } from './types';

const steps = Array.from({ length: 228 }, (_, index) => ({
  id: `stress-${index}`,
  act: Math.min(10, Math.floor(index / 23) + 1),
  indexInAct: index % 23,
  title: `Stress ${index}`,
  targetAreaId: `stress_area_${index}`,
  targetArea: `Stress Area ${index}`,
  lines: [], rawLines: [], tags: [], actions: [],
})) as CampaignStep[];

describe('bounded soak behavior', () => {
  it('replays a multi-megabyte noisy Client.txt stream without regression', () => {
    const lines: string[] = [];
    for (let index = 0; index < 15_000; index += 1) {
      lines.push(`2026/09/01 12:00:00 [INFO Client] irrelevant payload ${index} ${'x'.repeat(index % 80)}`);
      if (index < 180 && index % 75 === 0) lines.push(`2026/09/01 12:00:00 [DEBUG Client] Generating level ${index + 1} area "stress_area_${index}" with seed ${index}`);
    }
    const report = replayClientLogChunks(deterministicChunks(`${lines.join('\n')}\n`, 0x1234, 4096), steps);
    expect(report.errors).toEqual([]);
    expect(report.lines).toBeGreaterThan(15_000);
  }, 10_000);

  it('keeps progression history bounded under thousands of changes', () => {
    let history = [] as ReturnType<typeof appendHistory>;
    for (let index = 0; index < 5_000; index += 1) history = appendHistory(history, makeHistoryEntry(index, index + 1, 'stress', 'manual', false));
    expect(history).toHaveLength(80);
    expect(history.at(-1)?.from).toBe(4_999);
  });

  it('keeps run history bounded under repeated completed campaigns', () => {
    let history: RunHistoryEntry[] = [];
    for (let index = 0; index < 500; index += 1) {
      history = appendRunHistory(history, {
        id: String(index), startedAt: '2026-09-01T00:00:00Z', finishedAt: '2026-09-01T01:00:00Z', totalMs: 3_600_000 + index, townTimeMs: 10_000, splits: [],
      });
    }
    expect(history).toHaveLength(20);
    expect(history.at(-1)?.id).toBe('499');
  });
});
