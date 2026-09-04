import { describe, expect, it } from 'vitest';
import { actionsForRouteMode, buildRouteActions, looksUnhumanized, sourceLineVisibleForRouteMode, summarizeActions } from './actions';
import type { AreaRecord } from './types';

const areas = new Map<string, AreaRecord>([
  ['1_1_6', { id: '1_1_6', name: 'The Climb' }],
  ['1_1_9', { id: '1_1_9', name: 'The Ship Graveyard' }],
  ['1_1_11_1', { id: '1_1_11_1', name: 'The Cavern of Wrath' }],
]);

describe('campaign action regression coverage', () => {
  it('treats Exile-UI follow/reach shorthand with area IDs as decisive travel', () => {
    for (const line of [
      'follow wall to areaid1_1_6 ;; the climb',
      'follow wall: areaid1_1_9 ;; ship graveyard',
      'reach areaid1_1_11_1 ;; cavern of wrath',
    ]) {
      const summary = summarizeActions(buildRouteActions([line], areas));
      expect(summary.now?.type, line).toBe('travel');
      expect(summary.now?.title, line).not.toMatch(/areaid/i);
    }
  });

  it('turns quest-icon NPC lines into talk actions', () => {
    const actions = buildRouteActions(['(img:quest) tarkleigh: <the_caged_brute2>'], areas);
    expect(actions.some((action) => action.type === 'talk' && /Tarkleigh/i.test(action.title))).toBe(true);
  });

  it('never leaks nested quest tokens into kill or collect titles', () => {
    const actions = buildRouteActions([
      'leaguestart: kill fairgraves (quest:(allflame))',
      'kill fidelitas (lvl:14-15) || take (img:quest) (quest:gem)',
    ], areas);
    const decisive = actions.filter((action) => action.priority !== 'context');
    expect(decisive.length).toBeGreaterThan(0);
    for (const action of decisive) expect(looksUnhumanized(action.title), action.title).toBe(false);
    expect(decisive.some((action) => action.type === 'kill' && /Fairgraves/i.test(action.title))).toBe(true);
    expect(decisive.some((action) => action.type === 'kill' && /Fidelitas/i.test(action.title))).toBe(true);
  });

  it('distinguishes Labyrinth runs from Trials of Ascendancy and preserves early/regular timing', () => {
    const earlyLab = summarizeActions(buildRouteActions(['early option: (img:lab) normal_lab'], areas));
    const normalLab = summarizeActions(buildRouteActions(['regular option: (img:lab) normal_lab'], areas));
    const trial = summarizeActions(buildRouteActions(['leaguestart: complete (img:lab) trial'], areas));
    expect(earlyLab.now).toMatchObject({ title: 'Optional: run the Normal Labyrinth early if you feel ready', critical: false });
    expect(normalLab.now).toMatchObject({ title: 'Run the Normal Labyrinth now if you have not completed it', critical: true });
    expect(trial.now?.title).toBe('Complete the Ascendancy Trial in this area');
  });

  it('uses explicit passive skill point wording for Book of Skill rewards', () => {
    const actions = buildRouteActions(['(img:quest) eran: (quest:book_of_skill)'], areas);
    expect(actions.some((action) => action.type === 'passive' && /passive skill point/i.test(action.title))).toBe(true);
  });

  it('turns the campaign-end /passives check into a decisive critical action', () => {
    const summary = summarizeActions(buildRouteActions(['<type_"/passives"_in_chat>'], areas));
    expect(summary.now).toMatchObject({
      type: 'passive',
      critical: true,
      title: 'Type /passives in chat and verify every campaign passive reward',
    });
  });

  it('mirrors Exile-UI line-level league-start and twink visibility', () => {
    expect(sourceLineVisibleForRouteMode('leaguestart: complete (img:lab) trial', true)).toBe(true);
    expect(sourceLineVisibleForRouteMode('leaguestart: complete (img:lab) trial', false)).toBe(false);
    expect(sourceLineVisibleForRouteMode('twinkrun: complete (img:lab) merciless_lab', true)).toBe(false);
    expect(sourceLineVisibleForRouteMode('twinkrun: complete (img:lab) merciless_lab', false)).toBe(true);
    expect(sourceLineVisibleForRouteMode('enter areaid1_1_6', true)).toBe(true);
    expect(sourceLineVisibleForRouteMode('enter areaid1_1_6', false)).toBe(true);
  });

  it('reprioritizes the first remaining action after hiding the opposite route mode', () => {
    const actions = buildRouteActions([
      'twinkrun: kill hillock',
      'leaguestart: kill fairgraves',
      'enter areaid1_1_6 ;; the climb',
    ], areas);
    const league = summarizeActions(actionsForRouteMode(actions, true));
    const twink = summarizeActions(actionsForRouteMode(actions, false));
    expect(league.now?.title).toBe('Kill fairgraves');
    expect(twink.now?.title).toBe('Kill hillock');
    expect(league.then.some((action) => action.title === 'Enter The Climb')).toBe(true);
    expect(twink.then.some((action) => action.title === 'Enter The Climb')).toBe(true);
  });

  it('keeps equivalent league and twink actions separate until route-mode filtering', () => {
    const actions = buildRouteActions([
      'leaguestart: complete (img:lab) merciless_lab',
      'twinkrun: complete (img:lab) merciless_lab',
    ], areas);
    expect(actions.filter((action) => action.type === 'trial')).toHaveLength(2);
    expect(actionsForRouteMode(actions, true).filter((action) => action.type === 'trial')).toHaveLength(1);
    expect(actionsForRouteMode(actions, false).filter((action) => action.type === 'trial')).toHaveLength(1);
  });
});
