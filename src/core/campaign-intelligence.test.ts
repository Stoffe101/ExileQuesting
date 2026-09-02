import { describe, expect, it } from 'vitest';
import { buildCampaignIntelligence } from './campaign-intelligence';
import type { CampaignDataset } from './types';

function dataset(): CampaignDataset {
  return {
    schemaVersion: 2,
    source: { repository: 'test', commit: 'abc', fetchedAt: '2026-09-02T00:00:00Z', license: 'MIT' },
    areas: [{ id: 'mine', name: 'The Mines Level 1', crafting_recipe: 'Socket Colours' }],
    acts: [],
    steps: [
      { id: 'mine-step', act: 4, indexInAct: 0, title: 'Enter The Mines', targetAreaId: 'mine', targetArea: 'The Mines Level 1', rawLines: ['go mine'], lines: ['Go mine'], tags: [], actions: [] },
      { id: 'kitava', act: 5, indexInAct: 0, title: 'Defeat Kitava', rawLines: ['kill kitava'], lines: ['Kill Kitava'], tags: ['boss'], actions: [] },
    ],
  };
}

describe('campaign intelligence', () => {
  it('surfaces unmentioned crafting recipe unlocks from area metadata', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep['mine-step']?.[0]).toMatchObject({ type: 'craft', title: 'Unlock crafting recipe: Socket Colours' });
  });

  it('adds a critical resistance-crafting reminder before Kitava', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep.kitava?.[0]).toMatchObject({ type: 'craft', critical: true });
  });
});
