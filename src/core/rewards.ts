import type { CampaignDataset, RewardProgress } from './types';

export function rewardProgressFor(dataset: CampaignDataset, progress: number): RewardProgress {
  const passives = dataset.steps.filter((step) => step.permanentReward === 'passive');
  const trials = dataset.steps.filter((step) => step.permanentReward === 'trial');
  return {
    passive: {
      completed: passives.filter((step) => dataset.steps.indexOf(step) < progress).length,
      knownTotal: passives.length,
    },
    trials: {
      completed: trials.filter((step) => dataset.steps.indexOf(step) < progress).length,
      knownTotal: trials.length,
    },
  };
}

export function isPermanentRewardStep(tags: string[]): 'passive' | 'trial' | undefined {
  if (tags.includes('passive')) return 'passive';
  if (tags.includes('trial')) return 'trial';
  return undefined;
}
