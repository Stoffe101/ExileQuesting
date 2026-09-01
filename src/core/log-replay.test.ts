import { describe, expect, it } from 'vitest';
import { buildNoisyLog, deterministicChunks, replayClientLogChunks } from './log-replay';
import type { CampaignStep, ZoneEvent } from './types';

const steps = Array.from({ length: 40 }, (_, index) => ({
  id: `s${index}`,
  act: 1,
  indexInAct: index,
  title: `Step ${index}`,
  targetAreaId: `area_${index}`,
  targetArea: `Area ${index}`,
  lines: [], rawLines: [], tags: [], actions: [],
})) as CampaignStep[];

function event(index: number): ZoneEvent {
  return {
    type: 'area-generated',
    areaId: `area_${index}`,
    areaLevel: index + 1,
    raw: `2026/09/01 13:${String(index % 60).padStart(2, '0')}:00 [DEBUG Client] Generating level ${index + 1} area "area_${index}" with seed ${index}`,
  };
}

describe('Client.txt chaos replay', () => {
  it('survives deterministic arbitrary chunk boundaries and duplicate lines', () => {
    const log = buildNoisyLog(Array.from({ length: 25 }, (_, index) => event(index)));
    const report = replayClientLogChunks(deterministicChunks(log, 12345, 19), steps);
    expect(report.errors).toEqual([]);
    expect(report.parsedEvents).toBeGreaterThan(25);
    expect(report.finalProgress).toBeGreaterThanOrEqual(25);
  });

  it('is deterministic for the same seed', () => {
    const text = buildNoisyLog([event(0), event(1), event(2)]);
    expect(deterministicChunks(text, 99, 11)).toEqual(deterministicChunks(text, 99, 11));
  });

  it('ignores a large burst of irrelevant lines without inventing events', () => {
    const noise = `${Array.from({ length: 10_000 }, (_, index) => `noise ${index} level ${index % 100}`).join('\n')}\n`;
    const report = replayClientLogChunks(deterministicChunks(noise, 777, 53), steps);
    expect(report.parsedEvents).toBe(0);
    expect(report.finalProgress).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it('does not let duplicate area-generated events chain through repeated route targets', () => {
    const repeated = [
      { ...steps[0], targetAreaId: 'same', targetArea: 'Same' },
      { ...steps[1], targetAreaId: 'same', targetArea: 'Same' },
      { ...steps[2], targetAreaId: 'other', targetArea: 'Other' },
    ];
    const line = '2026/09/01 13:00:00 [DEBUG Client] Generating level 1 area "same" with seed 1\n';
    const report = replayClientLogChunks(deterministicChunks(line.repeat(4), 3, 7), repeated);
    expect(report.finalProgress).toBe(1);
  });
});
