import { summarizeActions } from './actions';
import type { CampaignDataset, RewardAudit, RewardProgress } from './types';

export function rewardProgressFor(
  dataset: CampaignDataset,
  progress: number,
  enabled: (step: CampaignDataset['steps'][number]) => boolean = () => true,
): RewardProgress {
  const passives = dataset.steps.filter((step) => enabled(step) && step.permanentReward === 'passive');
  const trials = dataset.steps.filter((step) => enabled(step) && step.permanentReward === 'trial');
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

export function buildRewardAudit(
  dataset: CampaignDataset,
  progress: number,
  confirmedStepIds: ReadonlySet<string> = new Set(),
  enabled: (step: CampaignDataset['steps'][number]) => boolean = () => true,
): RewardAudit {
  const items = dataset.steps.flatMap((step, stepIndex) => {
    if (!enabled(step) || !step.permanentReward) return [];
    const status = confirmedStepIds.has(step.id)
      ? 'confirmed' as const
      : stepIndex < progress
        ? 'route-passed' as const
        : 'pending' as const;
    return [{
      stepId: step.id,
      stepIndex,
      act: step.act,
      type: step.permanentReward,
      label: summarizeActions(step.actions).now?.title ?? step.title,
      status,
    }];
  });

  const passives = items.filter((item) => item.type === 'passive');
  const trials = items.filter((item) => item.type === 'trial');
  return {
    passive: {
      confirmed: passives.filter((item) => item.status === 'confirmed').length,
      routePassed: passives.filter((item) => item.status !== 'pending').length,
      knownTotal: passives.length,
    },
    trials: {
      confirmed: trials.filter((item) => item.status === 'confirmed').length,
      routePassed: trials.filter((item) => item.status !== 'pending').length,
      knownTotal: trials.length,
    },
    items,
    needsFinalPassivesAudit: progress >= Math.max(0, dataset.steps.length - 3)
      && passives.some((item) => item.status !== 'confirmed'),
  };
}
