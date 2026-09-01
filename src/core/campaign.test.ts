import { describe, expect, it } from 'vitest';
import { findProgressForZone, humanizeLine, isStepEnabled, normalizeCampaign, validateCampaign } from './campaign';
import { parseClientLogLine } from './log-parser';
import type { CampaignStep, RawAreas, RawGuide } from './types';

const areas: RawAreas = Array.from({ length: 10 }, (_, act) => Array.from({ length: 15 }, (_, index) => ({
  id: `${act + 1}_${index}`,
  name: `Area ${act + 1}-${index}`,
  lvl: act * 6 + index,
})));

const guide: RawGuide = Array.from({ length: 10 }, (_, act) => Array.from({ length: 18 }, (_, index) => [
  `enter areaid${act + 1}_${index % 15}`,
]));

describe('campaign adapter', () => {
  it('accepts a complete ten-act dataset', () => {
    const result = validateCampaign(guide, areas);
    expect(result.valid).toBe(true);
    expect(result.metrics.steps).toBe(180);
  });

  it('normalizes route instructions and creates stable semantic IDs', () => {
    const dataset = normalizeCampaign(guide, areas, [], {
      repository: 'test/repo', commit: 'abc', fetchedAt: 'now', license: 'MIT',
    });
    expect(dataset.steps[0].lines[0]).toContain('Area 1-0');
    expect(dataset.steps[0].id).toMatch(/^poe1\.act1\.1_0\./);
  });

  it('renders Exile-UI markup as readable text', () => {
    const lookup = new Map([['1_1_2', { id: '1_1_2', name: 'The Coast' }]]);
    expect(humanizeLine('(img:waypoint) to areaid1_1_2 ;; the coast', lookup)).toBe('Waypoint to The Coast — the coast');
  });

  it('filters league-start and optional steps', () => {
    const step = { condition: { key: 'league-start', value: 'yes' }, tags: ['optional'] } as CampaignStep;
    expect(isStepEnabled(step, { leagueStart: true, bandit: 'none', showOptional: false })).toBe(false);
    expect(isStepEnabled(step, { leagueStart: true, bandit: 'none', showOptional: true })).toBe(true);
  });

  it('advances to the instruction after entering a target area', () => {
    const steps = [
      { targetArea: 'The Coast' },
      { targetArea: 'Mud Flats' },
      { targetArea: 'Submerged Passage' },
    ] as CampaignStep[];
    expect(findProgressForZone(steps, 0, { areaName: 'Mud Flats' })).toBe(2);
  });
});

describe('Client.txt parsing', () => {
  it('parses English zone-entry lines', () => {
    const event = parseClientLogLine('2026/09/01 18:00:00 123 abc [INFO Client 123] : You have entered The Coast.');
    expect(event?.areaName).toBe('The Coast');
  });

  it('parses generated area IDs and levels', () => {
    const event = parseClientLogLine('2026/09/01 18:00:00 123 abc [DEBUG Client 123] Generating level 4 area "1_1_3" with seed 123');
    expect(event?.areaId).toBe('1_1_3');
    expect(event?.areaLevel).toBe(4);
  });
});

