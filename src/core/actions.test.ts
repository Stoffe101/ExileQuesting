import { describe, expect, it } from 'vitest';
import { buildRouteActions, looksUnhumanized, summarizeActions } from './actions';
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
});
