import { describe, expect, it } from 'vitest';
import {
  emptyRunSession,
  finishRun,
  pauseRun,
  recordRunArea,
  runStatsFor,
  startRun,
} from './run';
import type { RunHistoryEntry } from './types';

const at = (value: string) => new Date(`2026-09-03T${value}Z`);

function previousRun(): RunHistoryEntry {
  return {
    id: 'previous',
    startedAt: '2026-09-02T10:00:00Z',
    finishedAt: '2026-09-02T10:05:00Z',
    totalMs: 300_000,
    townTimeMs: 60_000,
    splits: [],
    visits: [
      { id: 'p:a', areaId: '1_1_2', areaName: 'The Coast', act: 1, enteredAt: '2026-09-02T10:00:00Z', durationMs: 90_000, revisit: false, town: false },
      { id: 'p:b', areaId: '1_1_3', areaName: 'The Mud Flats', act: 1, enteredAt: '2026-09-02T10:01:30Z', durationMs: 150_000, revisit: false, town: false },
      { id: 'p:t', areaId: '1_1_town', areaName: 'Lioneye’s Watch', act: 1, enteredAt: '2026-09-02T10:04:00Z', durationMs: 60_000, revisit: false, town: true },
    ],
  };
}

describe('personal route analytics', () => {
  it('tracks active zone time and revisits without counting paused time', () => {
    let session = startRun(emptyRunSession(), 1, at('10:00:00'));
    session = recordRunArea(session, '1_1_2', at('10:00:00'), { areaName: 'The Coast', act: 1 });
    session = recordRunArea(session, '1_1_3', at('10:02:00'), { areaName: 'The Mud Flats', act: 1 });
    session = recordRunArea(session, '1_1_2', at('10:03:00'), { areaName: 'The Coast', act: 1 });
    session = pauseRun(session, at('10:04:00'));
    session = startRun(session, 1, at('10:14:00'));
    session = recordRunArea(session, '1_1_4', at('10:15:00'), { areaName: 'The Submerged Passage', act: 1 });

    const stats = runStatsFor(session, [], at('10:15:00').getTime());
    expect(stats.elapsedMs).toBe(300_000);
    expect(stats.analytics.revisitCount).toBe(1);
    expect(stats.analytics.revisitMs).toBe(120_000);
    expect(stats.analytics.uniqueZones).toBe(3);
    expect(stats.analytics.zones.find((zone) => zone.areaId === '1_1_2')).toMatchObject({
      totalMs: 240_000,
      firstVisitMs: 120_000,
      revisitMs: 120_000,
      visits: 2,
    });
  });

  it('compares zones with the previous run and surfaces regressions conservatively', () => {
    let session = startRun(emptyRunSession(), 1, at('10:00:00'));
    session = recordRunArea(session, '1_1_2', at('10:00:00'), { areaName: 'The Coast', act: 1 });
    session = recordRunArea(session, '1_1_3', at('10:03:00'), { areaName: 'The Mud Flats', act: 1 });
    const coast = runStatsFor(session, [previousRun()], at('10:03:00').getTime()).analytics.zones.find((zone) => zone.areaId === '1_1_2');
    expect(coast?.deltaVsPreviousMs).toBe(90_000);
    expect(runStatsFor(session, [previousRun()], at('10:03:00').getTime()).analytics.insights.some((insight) => insight.kind === 'slow-zone')).toBe(true);
  });

  it('keeps the just-finished run out of the Previous reference and detects a new PB', () => {
    const previous = previousRun();
    let session = startRun(emptyRunSession(), 1, at('10:00:00'));
    session = recordRunArea(session, '1_1_2', at('10:00:00'), { areaName: 'The Coast', act: 1 });
    const finished = finishRun(session, at('10:04:00'));
    const stats = runStatsFor(finished.session, [previous, finished.history!], at('10:04:00').getTime());

    expect(stats.previous?.id).toBe('previous');
    expect(stats.personalBest?.id).toBe(finished.history?.id);
    expect(stats.analytics.newPersonalBest).toBe(true);
    expect(stats.analytics.totalDeltaVsPreviousMs).toBe(-60_000);
    expect(stats.analytics.insights[0]).toMatchObject({ kind: 'pace', tone: 'good', title: 'New personal best' });
  });

  it('treats revisit time as a review signal rather than declaring it an error', () => {
    let session = startRun(emptyRunSession(), 1, at('10:00:00'));
    session = recordRunArea(session, '1_1_2', at('10:00:00'), { areaName: 'The Coast', act: 1 });
    session = recordRunArea(session, '1_1_3', at('10:01:00'), { areaName: 'The Mud Flats', act: 1 });
    session = recordRunArea(session, '1_1_2', at('10:02:00'), { areaName: 'The Coast', act: 1 });
    session = recordRunArea(session, '1_1_4', at('10:03:30'), { areaName: 'The Submerged Passage', act: 1 });
    const insight = runStatsFor(session, [], at('10:03:30').getTime()).analytics.insights.find((item) => item.kind === 'revisit');
    expect(insight?.tone).toBe('attention');
    expect(insight?.detail).toContain('intentional');
  });
});
