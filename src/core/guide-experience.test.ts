import { describe, expect, it } from 'vitest';
import { campaignCompletionAudit, guideCalloutsForStep, guideRecoveryContext, labyrinthNameForStep, passivePlanSummary } from './guide-experience';
import type { CampaignDataset, CampaignStep, RewardAudit } from './types';

function step(overrides: Partial<CampaignStep> = {}): CampaignStep {
  return { id: 'step', act: 3, indexInAct: 1, title: 'Continue', lines: [], rawLines: [], tags: [], actions: [], ...overrides };
}

function dataset(steps: CampaignStep[]): CampaignDataset {
  return {
    schemaVersion: 2,
    source: { repository: 'test', commit: 'test', fetchedAt: new Date(0).toISOString(), license: 'test' },
    steps,
    acts: [{ act: 3, firstStep: 0, stepCount: steps.length }],
    areas: [],
  };
}

describe('Campaign Guide 2 semantics', () => {
  it('distinguishes a Labyrinth run from an Ascendancy Trial', () => {
    const lab = step({ rawLines: ['regular option: (img:lab) normal_lab'], tags: ['labyrinth'] });
    expect(labyrinthNameForStep(lab)).toBe('Normal');
    expect(guideCalloutsForStep(lab)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'labyrinth', title: 'Run the Normal Labyrinth now', importance: 'critical' }),
    ]));
    expect(guideCalloutsForStep(lab).some((callout) => callout.kind === 'trial')).toBe(false);
  });

  it('makes passive quests and trials explicit player instructions', () => {
    const passive = step({ id: 'passive', tags: ['passive'], permanentReward: 'passive' });
    const trial = step({ id: 'trial', tags: ['trial'], permanentReward: 'trial' });
    expect(guideCalloutsForStep(passive)[0].title).toBe('Passive skill point quest here');
    expect(guideCalloutsForStep(trial)[0].title).toBe('Complete the Ascendancy Trial in this area');
  });

  it('describes revisits and ahead-of-guide zones without changing progress', () => {
    const route = dataset([
      step({ id: 'a', targetAreaId: 'a', targetArea: 'Area A' }),
      step({ id: 'b', targetAreaId: 'b', targetArea: 'Area B' }),
      step({ id: 'c', targetAreaId: 'c', targetArea: 'Area C' }),
      step({ id: 'd', targetAreaId: 'd', targetArea: 'Area D' }),
      step({ id: 'e', targetAreaId: 'e', targetArea: 'Area E' }),
    ]);
    expect(guideRecoveryContext(route, 4, 'a').state).toBe('revisiting');
    expect(guideRecoveryContext(route, 0, 'e').state).toBe('catching-up');
    expect(guideRecoveryContext(route, 2, 'c').state).toBe('on-route');
  });

  it('does not depend on an in-game overlay for passive guidance', () => {
    const result = passivePlanSummary(undefined);
    expect(result.state).toBe('unavailable');
    expect(result.detail).toContain('does not draw over the in-game tree');
  });

  it('never calls completion ready while permanent rewards are unconfirmed', () => {
    const audit: RewardAudit = {
      passive: { confirmed: 20, routePassed: 22, knownTotal: 22 },
      trials: { confirmed: 6, routePassed: 6, knownTotal: 6 },
      items: [], needsFinalPassivesAudit: true,
    };
    const result = campaignCompletionAudit(audit);
    expect(result.state).toBe('attention');
    expect(result.checks.find((check) => check.id === 'passives')?.state).toBe('attention');
  });
});
