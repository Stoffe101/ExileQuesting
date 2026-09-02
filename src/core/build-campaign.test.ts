import { describe, expect, it } from 'vitest';
import type { GemAcquisitionNeed, GemAcquisitionPlan } from './gem-acquisition';
import { bridgeBuildPlanToCampaign } from './build-campaign';
import type { CampaignDataset, CampaignStep } from './types';

function step(id: string, act: number, rawLines: string[], condition?: CampaignStep['condition']): CampaignStep {
  return {
    id,
    act,
    indexInAct: 0,
    title: id,
    lines: rawLines,
    rawLines,
    tags: [],
    actions: [],
    condition,
  };
}

function dataset(steps: CampaignStep[]): CampaignDataset {
  return {
    schemaVersion: 2,
    source: { repository: 'test', commit: 'abc', fetchedAt: '2026-09-02T00:00:00Z', license: 'MIT' },
    steps,
    acts: [],
    areas: [],
  };
}

function need(overrides: Partial<GemAcquisitionNeed> = {}): GemAcquisitionNeed {
  return {
    stageId: 'aligned:level-12',
    stageTitle: 'Level 12',
    stageConfidence: 'high',
    requirement: { key: 'skill:arc', name: 'Arc', skillId: 'Arc', count: 1 },
    gem: { id: 'Metadata/Items/Gems/SkillGemArc', name: 'Arc', primaryAttribute: 'int', requiredLevel: 12, isSupport: false },
    requiredCopies: 1,
    preferred: {
      kind: 'vendor',
      gemId: 'Metadata/Items/Gems/SkillGemArc',
      act: 1,
      questId: 'a1q4',
      questName: 'Breaking Some Eggs',
      rewardOfferId: 'a1q4',
      questNpc: 'Tarkleigh',
      npc: 'Nessa',
      timingVerified: false,
    },
    alternatives: [],
    status: 'planned',
    ...overrides,
  };
}

function plan(needs: GemAcquisitionNeed[]): GemAcquisitionPlan {
  return { className: 'Witch', gameVersion: '3.29', sourceCommit: 'data', needs, warnings: [] };
}

describe('build campaign bridge', () => {
  it('uses quest token stem plus quest NPC, while keeping the actual vendor NPC in advice', () => {
    const route = dataset([
      step('wrong-npc', 1, ['(img:quest) nessa: <breaking_some_eggs1>']),
      step('unlock', 1, ['(img:quest) tarkleigh: <breaking_some_eggs1>, <breaking_some_eggs2>']),
    ]);
    const bridge = bridgeBuildPlanToCampaign(route, plan([need()]));
    expect(bridge.gemAvailability[0]).toMatchObject({ confidence: 'exact', unlockStepIds: ['unlock'] });
    expect(bridge.actionsByStep.unlock?.[0]).toMatchObject({ type: 'build', title: 'Buy Arc from Nessa' });
    expect(bridge.actionsByStep['wrong-npc']).toBeUndefined();
  });

  it('attaches the same exact unlock to mutually exclusive route variants', () => {
    const route = dataset([
      step('league', 1, ['(img:quest) tarkleigh: <breaking_some_eggs1>'], { key: 'league-start', value: 'yes' }),
      step('twink', 1, ['twinkrun: (img:quest) tarkleigh: <breaking_some_eggs2>'], { key: 'league-start', value: 'no' }),
    ]);
    const bridge = bridgeBuildPlanToCampaign(route, plan([need()]));
    expect(bridge.gemAvailability[0].unlockStepIds).toEqual(['league', 'twink']);
    expect(bridge.actionsByStep.league).toHaveLength(1);
    expect(bridge.actionsByStep.twink).toHaveLength(1);
  });

  it('uses a unique quest token when NPC evidence is unavailable', () => {
    const unique = need({ preferred: { ...need().preferred!, questNpc: 'Unknown NPC' } });
    const bridge = bridgeBuildPlanToCampaign(dataset([
      step('only', 2, ['(img:quest) silk: <sharp_and_cruel>']),
    ]), plan([{ ...unique, preferred: { ...unique.preferred!, act: 2, questName: 'Sharp and Cruel' } }]));
    expect(bridge.gemAvailability[0]).toMatchObject({ confidence: 'unique-token', unlockStepIds: ['only'] });
  });

  it('refuses ambiguous token-only matches instead of guessing', () => {
    const ambiguousSource = need({ preferred: { ...need().preferred!, questNpc: 'Nobody' } });
    const bridge = bridgeBuildPlanToCampaign(dataset([
      step('one', 1, ['(img:quest) nessa: <breaking_some_eggs1>']),
      step('two', 1, ['(img:quest) tarkleigh: <breaking_some_eggs2>']),
    ]), plan([ambiguousSource]));
    expect(bridge.unresolved).toHaveLength(1);
    expect(bridge.unresolved[0].confidence).toBe('unresolved');
    expect(bridge.actionsByStep).toEqual({});
  });

  it('resolves availability but suppresses player-facing actions for ambiguous PoB stages', () => {
    const bridge = bridgeBuildPlanToCampaign(dataset([
      step('unlock', 1, ['(img:quest) tarkleigh: <breaking_some_eggs1>']),
    ]), plan([need({ stageConfidence: 'ambiguous' })]));
    expect(bridge.gemAvailability[0].confidence).toBe('exact');
    expect(bridge.actionsByStep).toEqual({});
  });

  it('does not create campaign unlock actions for character starting gems', () => {
    const starting = need({ preferred: { kind: 'starting', gemId: 'Metadata/Items/Gems/SkillGemFireball', timingVerified: true } });
    const bridge = bridgeBuildPlanToCampaign(dataset([]), plan([starting]));
    expect(bridge.gemAvailability).toEqual([]);
    expect(bridge.actionsByStep).toEqual({});
  });
});
