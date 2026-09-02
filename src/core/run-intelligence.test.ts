import { describe, expect, it } from 'vitest';
import { buildRunIntelligence, normalizeRunZoneVisits, zoneVisitsFor } from './run-intelligence';
import { finishRun, pauseRun, recordActTransition, recordRunArea, startRun } from './run';
import type { RunHistoryEntry, RunSession } from './types';

function at(seconds: number): Date {
  return new Date(Date.UTC(2026, 8, 2, 20, 0, seconds));
}

describe('zone-level campaign run tracking', () => {
  it('settles zone durations and ignores duplicate Client.txt events for the same area', () => {
    let session = startRun({ state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, 1, at(0));
    session = recordRunArea(session, '1_1_1', at(1));
    const duplicate = recordRunArea(session, '1_1_1', at(20));
    expect(zoneVisitsFor(duplicate)).toHaveLength(1);

    session = recordRunArea(duplicate, '1_1_2', at(61));
    const visits = zoneVisitsFor(session);
    expect(visits).toHaveLength(2);
    expect(visits[0]).toMatchObject({ areaId: '1_1_1', durationMs: 60_000, leftAt: at(61).toISOString() });
    expect(visits[1]).toMatchObject({ areaId: '1_1_2', durationMs: 0 });
    expect(visits[1].leftAt).toBeUndefined();
  });

  it('excludes paused wall-clock time and does not count a resume continuation as a revisit', () => {
    let session = startRun({ state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, 1, at(0));
    session = recordRunArea(session, '1_1_1', at(1));
    session = pauseRun(session, at(61));
    expect(zoneVisitsFor(session)[0].durationMs).toBe(60_000);

    session = startRun(session, 1, at(121));
    const afterResume = zoneVisitsFor(session);
    expect(afterResume).toHaveLength(2);
    expect(afterResume[1]).toMatchObject({ areaId: '1_1_1', continuation: true, durationMs: 0 });

    session = recordRunArea(session, '1_1_2', at(181));
    const intel = buildRunIntelligence(session, undefined, at(181).getTime());
    expect(intel.revisitCount).toBe(0);
    expect(intel.trackedZoneMs).toBe(120_000);
    expect(intel.mostTime).toMatchObject({ areaId: '1_1_1', visits: 1, totalMs: 120_000 });
  });

  it('counts a real return to a non-town area as a revisit while excluding town returns', () => {
    let session = startRun({ state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, 1, at(0));
    session = recordRunArea(session, '1_town', at(0));
    session = recordRunArea(session, '1_1_1', at(30));
    session = recordRunArea(session, '1_town', at(90));
    session = recordRunArea(session, '1_1_1', at(120));
    session = recordRunArea(session, '1_1_2', at(180));

    const intel = buildRunIntelligence(session, undefined, at(180).getTime());
    expect(intel.revisitCount).toBe(1);
    expect(intel.townShare).toBeCloseTo(60_000 / 180_000, 5);
  });

  it('settles the final open visit into completed history', () => {
    let session = startRun({ state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, 1, at(0));
    session = recordRunArea(session, '1_1_1', at(10));
    const result = finishRun(session, at(70));
    expect(result.history).toBeTruthy();
    expect(zoneVisitsFor(result.history!)).toEqual([
      { areaId: '1_1_1', act: 1, enteredAt: at(10).toISOString(), leftAt: at(70).toISOString(), durationMs: 60_000 },
    ]);
  });

  it('compares completed act durations and shared zones against a personal best conservatively', () => {
    let current = startRun({ state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, 1, at(0));
    current = recordRunArea(current, '1_1_1', at(0));
    current = recordRunArea(current, '1_1_2', at(120));
    current = recordActTransition(current, 2, at(180));

    const pb = {
      id: 'pb', startedAt: at(0).toISOString(), finishedAt: at(150).toISOString(), totalMs: 150_000, townTimeMs: 0,
      splits: [{ act: 1, at: at(150).toISOString(), elapsedMs: 150_000 }],
      zoneVisits: [
        { areaId: '1_1_1', act: 1, enteredAt: at(0).toISOString(), leftAt: at(60).toISOString(), durationMs: 60_000 },
        { areaId: '1_1_2', act: 1, enteredAt: at(60).toISOString(), leftAt: at(150).toISOString(), durationMs: 90_000 },
      ],
    } as RunHistoryEntry;

    const intel = buildRunIntelligence(current, pb, at(180).getTime());
    expect(intel.largestPbLoss).toMatchObject({ areaId: '1_1_1', baselineMs: 60_000, deltaMs: 60_000 });
    expect(intel.actDeltas).toEqual([{ act: 1, currentMs: 180_000, baselineMs: 150_000, deltaMs: 30_000 }]);
  });

  it('bounds and sanitizes persisted telemetry instead of trusting arbitrary arrays', () => {
    const source = Array.from({ length: 650 }, (_, index) => ({
      areaId: `zone-${index}`,
      enteredAt: at(0).toISOString(),
      leftAt: at(1).toISOString(),
      durationMs: 1000,
    }));
    source.push({ areaId: '../bad', enteredAt: 'not-a-date', durationMs: -5 });
    const normalized = normalizeRunZoneVisits(source);
    expect(normalized).toHaveLength(600);
    expect(normalized[0].areaId).toBe('zone-50');
    expect(normalized.at(-1)?.areaId).toBe('zone-649');
  });

  it('keeps the telemetry helpers compatible with old sessions that have no zoneVisits field', () => {
    const legacy: RunSession = { state: 'running', startedAt: at(0).toISOString(), pausedMs: 0, townTimeMs: 0, currentAct: 1, splits: [] };
    expect(zoneVisitsFor(legacy)).toEqual([]);
    expect(buildRunIntelligence(legacy, undefined, at(60).getTime())).toMatchObject({ trackedZoneMs: 0, uniqueZones: 0, revisitCount: 0, townShare: 0 });
  });
});
