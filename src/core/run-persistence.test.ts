import { describe, expect, it } from 'vitest';
import { MAX_RUN_ZONE_VISITS, normalizeRunDocument } from './persistence';

describe('route analytics persistence', () => {
  it('loads old run documents without visit analytics', () => {
    const normalized = normalizeRunDocument({
      session: {
        state: 'running',
        startedAt: '2026-09-03T10:00:00Z',
        pausedMs: 0,
        townTimeMs: 12_000,
        currentAct: 2,
        splits: [],
        lastAreaId: '2_2_1',
        lastZoneChangedAt: '2026-09-03T10:03:00Z',
      },
      history: [{
        id: 'legacy',
        startedAt: '2026-09-02T10:00:00Z',
        finishedAt: '2026-09-02T11:00:00Z',
        totalMs: 3_600_000,
        townTimeMs: 300_000,
        splits: [],
      }],
    });

    expect(normalized.session.state).toBe('running');
    expect(normalized.session.visits).toEqual([]);
    expect(normalized.history[0].visits).toEqual([]);
  });

  it('drops malformed visits and keeps only bounded normalized fields', () => {
    const normalized = normalizeRunDocument({
      session: {
        state: 'running',
        startedAt: '2026-09-03T10:00:00Z',
        pausedMs: 0,
        townTimeMs: 0,
        splits: [],
        lastAreaId: '1_1_2',
        activeVisitStartedAt: '2026-09-03T10:01:00Z',
        visits: [
          { id: 'bad', areaId: '../escape', enteredAt: 'not-a-date', durationMs: -50, arbitrary: { nested: true } },
          { id: 'good', areaId: '1_1_2', areaName: 'The Coast', act: 1, enteredAt: '2026-09-03T10:01:00Z', durationMs: 90_000, revisit: false, town: false, arbitrary: 'drop me' },
        ],
      },
    });

    expect(normalized.session.visits).toEqual([{
      id: 'good',
      areaId: '1_1_2',
      areaName: 'The Coast',
      act: 1,
      enteredAt: '2026-09-03T10:01:00Z',
      durationMs: 90_000,
      revisit: false,
      town: false,
    }]);
    expect(normalized.session.activeVisitStartedAt).toBe('2026-09-03T10:01:00Z');
    expect('arbitrary' in (normalized.session.visits?.[0] as unknown as Record<string, unknown>)).toBe(false);
  });

  it('bounds oversized visit histories', () => {
    const visits = Array.from({ length: MAX_RUN_ZONE_VISITS + 50 }, (_, index) => ({
      id: String(index),
      areaId: `area_${index}`,
      enteredAt: '2026-09-03T10:00:00Z',
      durationMs: index,
      revisit: false,
      town: false,
    }));
    const normalized = normalizeRunDocument({ session: { state: 'finished', pausedMs: 0, townTimeMs: 0, splits: [], visits } });
    expect(normalized.session.visits).toHaveLength(MAX_RUN_ZONE_VISITS);
    expect(normalized.session.visits?.[0].id).toBe('50');
  });
});
