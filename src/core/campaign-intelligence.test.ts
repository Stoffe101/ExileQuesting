import { describe, expect, it } from 'vitest';
import { buildCampaignIntelligence } from './campaign-intelligence';
import type { CampaignDataset } from './types';

function dataset(): CampaignDataset {
  return {
    schemaVersion: 2,
    source: { repository: 'test', commit: 'abc', fetchedAt: '2026-09-02T00:00:00Z', license: 'MIT' },
    areas: [
      { id: '1_2_town', name: 'Forest Encampment' },
      { id: 'current-recipe', name: 'Ancient Pyramid', crafting_recipe: 'Spell Damage I' },
      { id: 'mine', name: 'The Mines Level 1', crafting_recipe: 'Socket Colours' },
    ],
    acts: [],
    steps: [
      { id: 'town-step', act: 2, indexInAct: 0, title: 'Enter Forest Encampment', targetAreaId: '1_2_town', targetArea: 'Forest Encampment', rawLines: ['go town'], lines: ['Go town'], tags: [], actions: [] },
      { id: 'recipe-step', act: 2, indexInAct: 1, title: 'Enter Ancient Pyramid', targetAreaId: 'current-recipe', targetArea: 'Ancient Pyramid', rawLines: ['go pyramid'], lines: ['Go pyramid'], tags: [], actions: [] },
      { id: 'siosa', act: 3, indexInAct: 0, title: 'Return to Siosa', rawLines: ['(img:quest) siosa: <a_fixture_of_fate>'], lines: ['Siosa: A Fixture of Fate'], tags: [], actions: [] },
      { id: 'mine-step', act: 4, indexInAct: 0, title: 'Enter The Mines', targetAreaId: 'mine', targetArea: 'The Mines Level 1', rawLines: ['go mine'], lines: ['Go mine'], tags: [], actions: [] },
      { id: 'kitava', act: 5, indexInAct: 0, title: 'Defeat Kitava', rawLines: ['kill kitava'], lines: ['Kill Kitava'], tags: ['boss'], actions: [] },
      { id: 'lilly', act: 6, indexInAct: 0, title: 'Return to Lilly', rawLines: ['(img:quest) lilly: <fallen_from_grace>'], lines: ['Lilly: Fallen from Grace'], tags: [], actions: [] },
    ],
  };
}

describe('campaign intelligence', () => {
  it('surfaces current crafting unlocks and the new 3.29 town bench availability', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep['town-step']?.[0]).toMatchObject({ type: 'craft', title: 'Crafting Bench is available in town' });
    expect(intelligence.actionsByStep['recipe-step']?.[0]).toMatchObject({ type: 'craft', title: 'Unlock crafting recipe: Spell Damage I' });
  });

  it('suppresses the removed fixed-colour socket recipe still present in older campaign metadata', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep['mine-step']).toBeUndefined();
  });

  it('adds a critical resistance-crafting reminder before Kitava', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep.kitava?.[0]).toMatchObject({ type: 'craft', critical: true });
  });

  it('explains the two major broad gem-vendor progression checkpoints', () => {
    const intelligence = buildCampaignIntelligence(dataset());
    expect(intelligence.actionsByStep.siosa?.[0]).toMatchObject({ type: 'gem', title: 'Siosa becomes your early broad gem fallback' });
    expect(intelligence.actionsByStep.siosa?.[0].detail).toMatch(/Bring the currency/);
    expect(intelligence.actionsByStep.lilly?.[0]).toMatchObject({ type: 'gem', title: 'Lilly becomes your long-term gem vendor' });
    expect(intelligence.actionsByStep.lilly?.[0].detail).toMatch(/build swaps/);
  });
});
