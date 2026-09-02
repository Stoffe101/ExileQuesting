import { describe, expect, it } from 'vitest';
import { buildRunActAnalytics } from './run-act-analytics';
import type { RunHistoryEntry, RunSession } from './types';

function history(id: string, act1: number, act2: number, act3: number): RunHistoryEntry {
  const total = act1 + act2 + act3;
  return {
    id,
    startedAt: '2026-09-02T10:00:00Z',
    finishedAt: '2026-09-02T11:00:00Z',
    totalMs: total,
    townTimeMs: 0,
    splits: [
      { act: 1, at: '2026-09-02T10:10:00Z', elapsedMs: act1 },
      { act: 2, at: '2026-09-02T10:20:00Z', elapsedMs: act1 + act2 },
      { act: 3, at: '2026-09-02T10:30:00Z', elapsedMs: total },
    ],
  };
}

function finishedSession(act1: number, act2: number, act3: number): RunSession {
  const total = act1 + act2 + act3;
  return {
    state: 'finished',
    startedAt: '2026-09-03T10:00:00Z',
    finishedAt: new Date(Date.parse('2026-09-03T10:00:00Z') + total).toISOString(),
    pausedMs: 0,
    townTimeMs: 0,
    currentAct: 3,
    splits: [
      { act: 1, at: '2026-09-03T10:10:00Z', elapsedMs: act1 },
      { act: 2, at: '2026-09-03T10:20:00Z', elapsedMs: act1 + act2 },
      { act: 3, at: '2026-09-03T10:30:00Z', elapsedMs: total },
    ],
    visits: [],
  };
}

describe('act-level pace analytics', () => {
  it('turns cumulative splits into per-Act durations and deltas', () => {
    const previous = history('previous', 600_000, 900_000, 1_200_000);
    const session = finishedSession(660_000, 780_000, 1_080_000);
    const analytics = buildRunActAnalytics(session, previous, previous);

    expect(analytics.acts.map((act) => [act.act, act.elapsedMs])).toEqual([
      [1, 660_000],
      [2, 780_000],
      [3, 1_080_000],
    ]);
    expect(analytics.acts.map((act) => act.deltaVsPreviousMs)).toEqual([60_000, -120_000, -120_000]);
    expect(analytics.acts.map((act) => act.cumulativeDeltaVsPreviousMs)).toEqual([60_000, -60_000, -180_000]);
  });

  it('surfaces the biggest regression and gain without inventing a cause', () => {
    const previous = history('previous', 600_000, 900_000, 1_200_000);
    const session = finishedSession(690_000, 720_000, 1_140_000);
    const analytics = buildRunActAnalytics(session, previous, previous);

    expect(analytics.biggestRegression?.act).toBe(1);
    expect(analytics.biggestRegression?.deltaVsPreviousMs).toBe(90_000);
    expect(analytics.biggestGain?.act).toBe(2);
    expect(analytics.biggestGain?.deltaVsPreviousMs).toBe(-180_000);
    expect(analytics.insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'regression', tone: 'attention', act: 1 }),
      expect.objectContaining({ kind: 'gain', tone: 'good', act: 2 }),
    ]));
  });

  it('shows the current Act live but refuses to compare it before completion', () => {
    const previous = history('previous', 600_000, 900_000, 1_200_000);
    const session: RunSession = {
      state: 'running',
      startedAt: '2026-09-03T10:00:00Z',
      pausedMs: 0,
      townTimeMs: 0,
      currentAct: 3,
      splits: [
        { act: 1, at: '2026-09-03T10:09:00Z', elapsedMs: 540_000 },
        { act: 2, at: '2026-09-03T10:23:00Z', elapsedMs: 1_380_000 },
      ],
      visits: [],
    };
    const now = Date.parse('2026-09-03T10:30:00Z');
    const analytics = buildRunActAnalytics(session, previous, previous, now);

    expect(analytics.acts[0]).toMatchObject({ act: 1, complete: true, deltaVsPreviousMs: -60_000 });
    expect(analytics.acts[1]).toMatchObject({ act: 2, complete: true, deltaVsPreviousMs: -60_000 });
    expect(analytics.acts[2]).toMatchObject({ act: 3, complete: false, elapsedMs: 420_000 });
    expect(analytics.acts[2].deltaVsPreviousMs).toBeUndefined();
    expect(analytics.insights.some((insight) => insight.title.includes('Through Act 2'))).toBe(true);
  });

  it('handles skipped split acts deterministically without negative durations', () => {
    const session: RunSession = {
      state: 'finished',
      startedAt: '2026-09-03T10:00:00Z',
      finishedAt: '2026-09-03T10:20:00Z',
      pausedMs: 0,
      townTimeMs: 0,
      currentAct: 3,
      splits: [
        { act: 1, at: '2026-09-03T10:10:00Z', elapsedMs: 600_000 },
        { act: 2, at: '2026-09-03T10:10:00Z', elapsedMs: 600_000 },
        { act: 3, at: '2026-09-03T10:20:00Z', elapsedMs: 1_200_000 },
      ],
      visits: [],
    };
    expect(buildRunActAnalytics(session).acts.map((act) => act.elapsedMs)).toEqual([600_000, 0, 600_000]);
  });
});
