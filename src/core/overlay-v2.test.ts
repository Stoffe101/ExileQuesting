import { describe, expect, it } from 'vitest';
import { buildRouteActions, looksUnhumanized, summarizeActions } from './actions';
import { validateCompatibilityManifest } from './compatibility';
import { parseClientLogLine, parseLogTail, latestZoneEvent } from './log-parser';
import { LogLineBuffer } from './log-stream';
import { appendHistory, decideProgression, makeHistoryEntry, reconcileStartup } from './progression';
import { calculateXpGuidance, experienceSafeZone } from './xp';
import type { CampaignStep } from './types';

describe('structured route actions', () => {
  const areas = new Map([
    ['1_1_2', { id: '1_1_2', name: 'The Coast' }],
    ['1_1_3', { id: '1_1_3', name: 'Mud Flats' }],
  ]);

  it('promotes decisive actions ahead of wall-following context', () => {
    const actions = buildRouteActions(['follow 6 side of wall', 'kill hailrake for chest level 4', 'relog areaid1_1_2'], areas);
    const summary = summarizeActions(actions);
    expect(summary.now?.type).toBe('kill');
    expect(summary.now?.title.toLowerCase()).toContain('hailrake');
    expect(summary.context.some((action) => action.title.toLowerCase().includes('wall'))).toBe(true);
  });

  it('preserves the authored sequence between decisive actions', () => {
    const actions = buildRouteActions(['enter areaid1_1_3', 'kill rhoa', 'relog areaid1_1_2'], areas);
    const summary = summarizeActions(actions);
    expect(summary.now?.type).toBe('travel');
    expect(summary.then.map((action) => action.type)).toEqual(['kill', 'relog']);
  });

  it('turns travel and waypoint markup into semantic actions', () => {
    const actions = buildRouteActions(['(img:waypoint) to areaid1_1_3', 'enter areaid1_1_3'], areas);
    expect(actions.some((action) => action.type === 'waypoint' && action.title.includes('Mud Flats'))).toBe(true);
    expect(actions.some((action) => action.type === 'travel' && action.title.includes('Mud Flats'))).toBe(true);
  });

  it('detects source syntax that should not leak into UI copy', () => {
    expect(looksUnhumanized('Quest tarkleigh: enemy_at_the_gate')).toBe(true);
    expect(looksUnhumanized('Talk to Tarkleigh')).toBe(false);
  });
});

describe('strict Client.txt events', () => {
  it('never treats an area level as a character level', () => {
    const event = parseClientLogLine('2026/09/01 18:00:00 [DEBUG Client] Generating level 12 area "1_2_3" with seed 99');
    expect(event?.type).toBe('area-generated');
    expect(event?.areaLevel).toBe(12);
    expect(event?.characterLevel).toBeUndefined();
  });

  it('parses the strict character-level form', () => {
    const event = parseClientLogLine('2026/09/01 18:02:00 [INFO Client] Stoffe (Witch) is now level 19');
    expect(event?.type).toBe('character-level');
    expect(event?.characterLevel).toBe(19);
    expect(event?.characterName).toBe('Stoffe');
    expect(event?.characterClass).toBe('Witch');
  });

  it('pairs an entered-area startup line with its preceding generated area identity', () => {
    const events = parseLogTail([
      '2026/09/01 18:00:00 [DEBUG Client] Generating level 1 area "1_1_1" with seed 1',
      '2026/09/01 18:00:01 [INFO Client] : You have entered Twilight Strand.',
    ].join('\n'));
    expect(latestZoneEvent(events)).toMatchObject({ areaId: '1_1_1', areaName: 'Twilight Strand', areaLevel: 1 });
  });

  it('finds the latest zone from a bounded log tail', () => {
    const events = parseLogTail([
      '2026/09/01 18:00:00 [DEBUG Client] Generating level 3 area "1_1_2" with seed 1',
      '2026/09/01 18:01:00 [INFO Client] You have entered The Coast.',
      '2026/09/01 18:02:00 [DEBUG Client] Generating level 4 area "1_1_3" with seed 2',
    ].join('\n'));
    expect(latestZoneEvent(events)?.areaId).toBe('1_1_3');
  });

  it('buffers a log event split across filesystem chunks', () => {
    const stream = new LogLineBuffer();
    expect(stream.push('2026/09/01 18:00:00 [DEBUG Client] Generating level 4 ar')).toEqual([]);
    const lines = stream.push('ea "1_1_3" with seed 2\nnoise without an event\n');
    expect(lines).toHaveLength(2);
    expect(parseClientLogLine(lines[0])?.areaId).toBe('1_1_3');
    expect(parseClientLogLine(lines[1])).toBeNull();
    expect(stream.pending()).toBe('');
  });

  it('resets buffered partial data after a recreated log', () => {
    const stream = new LogLineBuffer();
    stream.push('half of an old line');
    expect(stream.pending()).not.toBe('');
    stream.reset();
    expect(stream.pending()).toBe('');
  });
});

describe('progression state decisions', () => {
  const steps = [
    { id: 'a', targetAreaId: '1_1_2', targetArea: 'The Coast' },
    { id: 'b', targetAreaId: '1_1_3', targetArea: 'Mud Flats' },
    { id: 'c', targetAreaId: '1_1_4', targetArea: 'Submerged Passage' },
    { id: 'd', targetAreaId: '1_1_5', targetArea: 'The Ledge' },
    { id: 'e', targetAreaId: '1_1_6', targetArea: 'The Climb' },
  ] as CampaignStep[];

  it('uses internal IDs as verified progression signals when bounded catch-up is explicitly requested', () => {
    expect(decideProgression(steps, 0, { areaId: '1_1_3' }, { allowAheadMatch: true })).toMatchObject({ to: 2, confidence: 'verified' });
  });

  it('uses display names only as inferred fallback when bounded catch-up is explicitly requested', () => {
    expect(decideProgression(steps, 0, { areaName: 'Mud Flats' }, { allowAheadMatch: true })).toMatchObject({ to: 2, confidence: 'inferred' });
  });

  it('fails closed instead of silently skipping the current objective when a later route zone is detected', () => {
    expect(decideProgression(steps, 0, { areaId: '1_1_3' })).toBeNull();
    expect(decideProgression(steps, 0, { areaName: 'Mud Flats' })).toBeNull();
    expect(decideProgression(steps, 1, { areaId: '1_1_3' })).toMatchObject({ to: 2, confidence: 'verified' });
  });

  it('does not advance twice for a duplicate area event', () => {
    expect(decideProgression(steps, 2, { areaId: '1_1_3' })).toBeNull();
  });

  it('offers reconciliation rather than silently making a startup jump', () => {
    expect(reconcileStartup(steps, 0, { areaId: '1_1_3' }).state).toBe('suggested');
    expect(reconcileStartup(steps, 0, { areaId: '1_1_6' }).state).toBe('suggested');
  });

  it('keeps bounded progress history', () => {
    let history = [] as ReturnType<typeof appendHistory>;
    for (let index = 0; index < 90; index += 1) history = appendHistory(history, makeHistoryEntry(index, index + 1, 'test', 'manual', false));
    expect(history).toHaveLength(80);
  });
});

describe('XP pacing', () => {
  it('uses the level-dependent safe zone', () => {
    expect(experienceSafeZone(1)).toBe(3);
    expect(experienceSafeZone(32)).toBe(5);
  });

  it('classifies efficient, behind and overlevelled pacing', () => {
    expect(calculateXpGuidance(20, 23).pace).toBe('efficient');
    expect(calculateXpGuidance(20, 27).pace).toBe('behind');
    expect(calculateXpGuidance(30, 20).pace).toBe('overlevelled');
  });
});

describe('compatibility manifest safety', () => {
  it('accepts data-only GitHub path mappings', () => {
    expect(validateCompatibilityManifest({
      schemaVersion: 1,
      upstream: { repository: 'Lailloken/Exile-UI', guidePath: 'data/english/[leveltracker] default guide.json', areasPath: 'data/english/[leveltracker] areas.json' },
      adapterVersion: 2,
      campaignSchemaVersion: 2,
      updatedAt: '2026-09-01T20:00:00Z',
    })).not.toBeNull();
  });

  it('rejects executable or traversal-like paths', () => {
    expect(validateCompatibilityManifest({
      schemaVersion: 1,
      upstream: { repository: 'Lailloken/Exile-UI', guidePath: '../../evil.js', areasPath: 'data/areas.json' },
      adapterVersion: 2,
      campaignSchemaVersion: 2,
      updatedAt: '2026-09-01T20:00:00Z',
    })).toBeNull();
  });
});
