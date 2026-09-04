import type { BuildCoachSnapshot } from './build-coach';
import type { CampaignDataset, CampaignStep, RewardAudit, RouteActionType } from './types';

export type GuideImportance = 'critical' | 'milestone' | 'normal' | 'optional';
export type GuideCalloutKind = 'passive' | 'trial' | 'labyrinth' | 'waypoint' | 'build' | 'craft' | 'warning';

export interface GuideCallout {
  id: string;
  kind: GuideCalloutKind;
  importance: GuideImportance;
  title: string;
  detail?: string;
  actionType?: RouteActionType;
}

export interface GuideRecoveryContext {
  state: 'on-route' | 'revisiting' | 'catching-up' | 'unknown';
  matchedStepIndex?: number;
  matchedStep?: CampaignStep;
  title: string;
  detail: string;
}

export interface PassivePlanSummary {
  state: 'exact' | 'stage' | 'complete' | 'unavailable';
  title: string;
  detail: string;
  nodeId?: number;
  completed?: number;
  total?: number;
}

export interface CampaignCompletionCheck {
  id: string;
  label: string;
  state: 'complete' | 'attention' | 'unknown';
  detail: string;
}

export interface CampaignCompletionAuditSummary {
  state: 'ready' | 'attention';
  headline: string;
  checks: CampaignCompletionCheck[];
}

export interface ProgressionTimelineItem {
  id: string;
  act: number;
  stepIndex: number;
  kind: 'act' | 'passive' | 'trial' | 'labyrinth' | 'build' | 'boss';
  title: string;
  complete: boolean;
  current: boolean;
}

const LAB_NAMES: Record<string, string> = {
  normal: 'Normal',
  cruel: 'Cruel',
  merciless: 'Merciless',
  eternal: 'Eternal',
};

export function labyrinthNameForStep(step: CampaignStep): string | undefined {
  const raw = step.rawLines.join(' ').toLowerCase();
  const match = raw.match(/\b(normal|cruel|merciless|eternal)_lab\b/);
  return match ? LAB_NAMES[match[1]] : undefined;
}

function labyrinthTimingForStep(step: CampaignStep): 'early' | 'regular' | 'scheduled' {
  const raw = step.rawLines.join(' ').toLowerCase();
  if (/\bearly\s+option\b/.test(raw)) return 'early';
  if (/\bregular\s+option\b/.test(raw)) return 'regular';
  return 'scheduled';
}

function hasAction(step: CampaignStep, type: RouteActionType): boolean {
  return step.actions.some((action) => action.type === type);
}

export function guideCalloutsForStep(step: CampaignStep): GuideCallout[] {
  const callouts: GuideCallout[] = [];
  const optional = step.tags.includes('optional');
  const lab = labyrinthNameForStep(step);

  if (step.permanentReward === 'passive' || step.tags.includes('passive')) {
    callouts.push({
      id: `${step.id}:passive`,
      kind: 'passive',
      importance: 'critical',
      title: 'Passive skill point quest here',
      detail: 'Complete the quest and make sure you claim its Book of Skill before you consider this objective finished.',
      actionType: 'passive',
    });
  }

  if (step.permanentReward === 'trial' || (step.tags.includes('trial') && !lab)) {
    callouts.push({
      id: `${step.id}:trial`,
      kind: 'trial',
      importance: 'critical',
      title: 'Complete the Ascendancy Trial in this area',
      detail: 'Do the trial while you are already here. Leaving it behind creates an avoidable return trip before the Labyrinth.',
      actionType: 'trial',
    });
  }

  if (lab) {
    const timing = labyrinthTimingForStep(step);
    callouts.push(timing === 'early' ? {
      id: `${step.id}:labyrinth`,
      kind: 'labyrinth',
      importance: 'milestone',
      title: `Optional early ${lab} Labyrinth timing`,
      detail: `Run the ${lab} Labyrinth here only if you feel ready. Otherwise keep following the campaign; the guide has a later regular timing. You never need to run the same Labyrinth twice for Ascendancy points.`,
      actionType: 'trial',
    } : timing === 'regular' ? {
      id: `${step.id}:labyrinth`,
      kind: 'labyrinth',
      importance: 'critical',
      title: `Run the ${lab} Labyrinth now if you have not already completed it`,
      detail: `This is the regular ${lab} Labyrinth timing, not another Trial of Ascendancy. If you used the earlier option and already took these Ascendancy points, skip the repeat and continue.`,
      actionType: 'trial',
    } : {
      id: `${step.id}:labyrinth`,
      kind: 'labyrinth',
      importance: 'critical',
      title: `Run the ${lab} Labyrinth now`,
      detail: `This route step is a ${lab} Labyrinth run, not another Trial of Ascendancy. Finish the Labyrinth and take your Ascendancy points before continuing.`,
      actionType: 'trial',
    });
  }

  if (hasAction(step, 'waypoint')) {
    callouts.push({
      id: `${step.id}:waypoint`,
      kind: 'waypoint',
      importance: optional ? 'optional' : 'milestone',
      title: 'Grab the waypoint before leaving',
      detail: 'This route uses the waypoint as a return point or progression anchor. Activate it while you pass it.',
      actionType: 'waypoint',
    });
  }

  const buildActions = step.actions.filter((action) => action.type === 'build');
  if (buildActions.length) {
    callouts.push({
      id: `${step.id}:build`,
      kind: 'build',
      importance: 'milestone',
      title: 'Build milestone here',
      detail: buildActions.map((action) => action.title).join(' · '),
      actionType: 'build',
    });
  }

  const craftActions = step.actions.filter((action) => action.type === 'craft');
  if (craftActions.length) {
    callouts.push({
      id: `${step.id}:craft`,
      kind: 'craft',
      importance: optional ? 'optional' : 'normal',
      title: 'Crafting opportunity in this step',
      detail: craftActions.map((action) => action.title).join(' · '),
      actionType: 'craft',
    });
  }

  if (step.annotation?.warning) {
    callouts.push({
      id: `${step.id}:warning`,
      kind: 'warning',
      importance: 'critical',
      title: "Don't leave yet",
      detail: step.annotation.warning,
      actionType: 'warning',
    });
  }

  return callouts;
}

function closestRouteIndexForArea(dataset: CampaignDataset, currentAreaId: string, progress: number): number | undefined {
  const matches = dataset.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.targetAreaId === currentAreaId);
  if (!matches.length) return undefined;
  return matches.reduce((best, candidate) => (
    Math.abs(candidate.index - progress) < Math.abs(best.index - progress) ? candidate : best
  )).index;
}

export function guideRecoveryContext(dataset: CampaignDataset, progress: number, currentAreaId?: string): GuideRecoveryContext {
  if (!currentAreaId) {
    return { state: 'unknown', title: 'Waiting for zone detection', detail: 'ExileQuesting will compare your detected zone with the route without moving your saved progress.' };
  }
  const matchedStepIndex = closestRouteIndexForArea(dataset, currentAreaId, progress);
  if (matchedStepIndex === undefined) {
    return { state: 'unknown', title: 'This zone is outside the known route step', detail: 'Keep the saved route intact. Use the guide recovery panel if you deliberately detoured.' };
  }
  const matchedStep = dataset.steps[matchedStepIndex];
  if (matchedStepIndex < progress - 1) {
    return {
      state: 'revisiting', matchedStepIndex, matchedStep,
      title: `Revisiting ${matchedStep.targetArea ?? 'an earlier area'}`,
      detail: 'Your furthest campaign progress is preserved. ExileQuesting can still show the useful objective and layout context for this earlier zone.',
    };
  }
  if (matchedStepIndex > progress + 1) {
    return {
      state: 'catching-up', matchedStepIndex, matchedStep,
      title: `You are ahead of the saved route in ${matchedStep.targetArea ?? 'this area'}`,
      detail: 'The guide will not silently skip objectives. Review the catch-up list before resuming from this location.',
    };
  }
  return {
    state: 'on-route', matchedStepIndex, matchedStep,
    title: 'Route is in sync',
    detail: 'The detected area matches your current campaign neighborhood.',
  };
}

export function passivePlanSummary(coach?: BuildCoachSnapshot): PassivePlanSummary {
  if (!coach) {
    return { state: 'unavailable', title: 'Import a build for passive guidance', detail: 'Passive Plan uses the active Maxroll or Path of Building profile. It does not draw over the in-game tree.' };
  }
  if (coach.maxroll?.nextPassive) {
    const next = coach.maxroll.nextPassive;
    return {
      state: 'exact',
      title: `${next.type === 'refund' ? 'Refund' : 'Take'} ${next.nodeName}`,
      detail: `${next.completed}/${next.total} ordered passive operations complete · checkpoint ${next.checkpoint}.`,
      nodeId: next.nodeId,
      completed: next.completed,
      total: next.total,
    };
  }
  if (coach.maxroll?.passiveComplete) {
    return {
      state: 'complete',
      title: 'Maxroll passive path complete',
      detail: `${coach.maxroll.passiveCompleted}/${coach.maxroll.passiveTotal} ordered passive operations complete.`,
      completed: coach.maxroll.passiveCompleted,
      total: coach.maxroll.passiveTotal,
    };
  }
  if (coach.nextPassiveText) {
    return {
      state: 'stage',
      title: coach.nextPassiveText,
      detail: 'This comes from the active Path of Building stage. ExileQuesting will not invent an exact click order when the source does not provide one.',
    };
  }
  return { state: 'unavailable', title: 'No passive milestone available', detail: 'The active build stage does not expose trustworthy next-passive guidance.' };
}

export function campaignCompletionAudit(rewardAudit: RewardAudit, coach?: BuildCoachSnapshot): CampaignCompletionAuditSummary {
  const passivesComplete = rewardAudit.passive.confirmed >= rewardAudit.passive.knownTotal;
  const trialsComplete = rewardAudit.trials.confirmed >= rewardAudit.trials.knownTotal;
  const gemIssues = coach?.currentGemTasks.filter((task) => task.status !== 'planned').length ?? 0;
  const checks: CampaignCompletionCheck[] = [
    {
      id: 'passives', label: 'Permanent passive quests', state: passivesComplete ? 'complete' : 'attention',
      detail: `${rewardAudit.passive.confirmed}/${rewardAudit.passive.knownTotal} confirmed${passivesComplete ? '' : ' · run /passives before maps'}`,
    },
    {
      id: 'trials', label: 'Ascendancy Trials', state: trialsComplete ? 'complete' : 'attention',
      detail: `${rewardAudit.trials.confirmed}/${rewardAudit.trials.knownTotal} confirmed`,
    },
    {
      id: 'labyrinths', label: 'Labyrinth / Ascendancy points', state: 'unknown',
      detail: 'The route schedules Normal, Cruel and Merciless Labyrinth runs, but Client.txt does not prove completion. Confirm your Ascendancy points in-game before maps.',
    },
    {
      id: 'build-stage', label: 'Build progression', state: coach ? (gemIssues ? 'attention' : 'complete') : 'unknown',
      detail: coach ? `${coach.stageTitle ?? 'Active stage'}${gemIssues ? ` · ${gemIssues} gem acquisition issue${gemIssues === 1 ? '' : 's'} to review` : ' · active build guidance loaded'}` : 'No build profile imported.',
    },
    {
      id: 'gear', label: 'Gear review', state: coach?.gearHints.length ? 'attention' : coach ? 'complete' : 'unknown',
      detail: coach?.gearHints.length ? `${coach.gearHints.length} build-aware gear target${coach.gearHints.length === 1 ? '' : 's'} still worth checking.` : coach ? 'No active leveling gear hint is demanding attention.' : 'Import a build to make this check build-aware.',
    },
  ];
  const attention = checks.some((check) => check.state === 'attention');
  const manual = checks.some((check) => check.state === 'unknown');
  return {
    state: attention ? 'attention' : 'ready',
    headline: attention ? 'Finish these checks before settling into maps' : manual ? 'Automatic checks are clear · finish the manual checks' : 'Campaign audit is clear',
    checks,
  };
}

export function progressionTimeline(dataset: CampaignDataset, progress: number): ProgressionTimelineItem[] {
  const items: ProgressionTimelineItem[] = [];
  const seenActs = new Set<number>();
  dataset.steps.forEach((step, stepIndex) => {
    if (!seenActs.has(step.act)) {
      seenActs.add(step.act);
      items.push({ id: `act:${step.act}`, act: step.act, stepIndex, kind: 'act', title: `Act ${step.act}`, complete: stepIndex < progress, current: stepIndex === progress });
    }
    const lab = labyrinthNameForStep(step);
    const build = step.actions.find((action) => action.type === 'build');
    const boss = step.tags.includes('boss') && /kitava/i.test(`${step.title} ${step.rawLines.join(' ')}`);
    if (step.permanentReward === 'passive') items.push({ id: `${step.id}:passive`, act: step.act, stepIndex, kind: 'passive', title: 'Passive skill point', complete: stepIndex < progress, current: stepIndex === progress });
    if (step.permanentReward === 'trial') items.push({ id: `${step.id}:trial`, act: step.act, stepIndex, kind: 'trial', title: 'Ascendancy Trial', complete: stepIndex < progress, current: stepIndex === progress });
    if (lab) items.push({ id: `${step.id}:lab`, act: step.act, stepIndex, kind: 'labyrinth', title: `${lab} Labyrinth`, complete: stepIndex < progress, current: stepIndex === progress });
    if (build) items.push({ id: `${step.id}:build`, act: step.act, stepIndex, kind: 'build', title: build.title, complete: stepIndex < progress, current: stepIndex === progress });
    if (boss) items.push({ id: `${step.id}:boss`, act: step.act, stepIndex, kind: 'boss', title: step.act === 10 ? 'Finish campaign · Kitava' : 'Kitava resistance checkpoint', complete: stepIndex < progress, current: stepIndex === progress });
  });
  return items;
}
