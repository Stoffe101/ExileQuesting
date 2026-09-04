import { describe, expect, it } from 'vitest';
import { campaignForRouteMode, normalizeCampaign } from './campaign';
import { buildRewardAudit, rewardProgressFor } from './rewards';
import type { RawAreas, RawGuide } from './types';

const areas: RawAreas = [[
  { id: 'league_area', name: 'League Area', lvl: 10 },
  { id: 'twink_area', name: 'Twink Area', lvl: 10 },
  { id: 'shared_area', name: 'Shared Area', lvl: 11 },
]];

const source = { repository: 'test', commit: 'test', fetchedAt: new Date(0).toISOString(), license: 'test' };

describe('runtime campaign route modes', () => {
  it('materializes line-level league-start/twink alternatives without changing step IDs', () => {
    const guide: RawGuide = [[[
      'leaguestart: complete (img:lab) trial',
      'leaguestart: enter areaidleague_area ;; league area',
      'twinkrun: complete (img:lab) normal_lab',
      'twinkrun: enter areaidtwink_area ;; twink area',
      'grab (img:waypoint) then enter areaidshared_area ;; shared area',
    ]]];
    const raw = normalizeCampaign(guide, areas, [], source);
    const league = campaignForRouteMode(raw, true);
    const twink = campaignForRouteMode(raw, false);

    expect(league.steps[0].id).toBe(raw.steps[0].id);
    expect(twink.steps[0].id).toBe(raw.steps[0].id);
    expect(league.steps[0].rawLines.some((line) => line.includes('twinkrun:'))).toBe(false);
    expect(twink.steps[0].rawLines.some((line) => line.includes('leaguestart:'))).toBe(false);
    expect(league.steps[0].actions.some((action) => /Ascendancy Trial/.test(action.title))).toBe(true);
    expect(league.steps[0].actions.some((action) => /Normal Labyrinth/.test(action.title))).toBe(false);
    expect(twink.steps[0].actions.some((action) => /Normal Labyrinth/.test(action.title))).toBe(true);
    expect(twink.steps[0].actions.some((action) => /Ascendancy Trial/.test(action.title))).toBe(false);
    expect(league.steps[0].targetAreaId).toBe('shared_area');
    expect(twink.steps[0].targetAreaId).toBe('shared_area');
    expect(league.steps[0].permanentReward).toBe('trial');
    expect(twink.steps[0].permanentReward).toBeUndefined();
  });

  it('recomputes the target when the destination itself is mode-specific', () => {
    const guide: RawGuide = [[[
      'leaguestart: enter areaidleague_area ;; league area',
      'twinkrun: enter areaidtwink_area ;; twink area',
    ]]];
    const raw = normalizeCampaign(guide, areas, [], source);
    expect(campaignForRouteMode(raw, true).steps[0].targetAreaId).toBe('league_area');
    expect(campaignForRouteMode(raw, false).steps[0].targetAreaId).toBe('twink_area');
  });

  it('lets reward audits ignore structured route variants without changing legacy callers', () => {
    const guide: RawGuide = [[
      { condition: ['league-start', 'yes'], lines: ['complete (img:lab) trial'] },
      { condition: ['league-start', 'no'], lines: ['twinkrun: enter areaidtwink_area ;; twink area'] },
    ]];
    const active = campaignForRouteMode(normalizeCampaign(guide, areas, [], source), true);
    const enabled = (step: typeof active.steps[number]) => step.condition?.key !== 'league-start' || step.condition.value === 'yes';
    expect(rewardProgressFor(active, 2).trials.knownTotal).toBe(1);
    expect(rewardProgressFor(active, 2, enabled).trials.knownTotal).toBe(1);
    expect(buildRewardAudit(active, 2, new Set(), enabled).trials.knownTotal).toBe(1);
  });
});
