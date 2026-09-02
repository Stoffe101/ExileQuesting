import type { GemAcquisitionNeed, GemAcquisitionPlan, GemAcquisitionSource } from './gem-acquisition';
import type { CampaignDataset, CampaignStep, RouteAction } from './types';

export type CampaignBuildResolutionConfidence = 'exact' | 'unique-token' | 'unresolved';

export interface CampaignGemAvailability {
  need: GemAcquisitionNeed;
  source: GemAcquisitionSource;
  confidence: CampaignBuildResolutionConfidence;
  unlockStepIds: string[];
  reason: string;
}

export interface CampaignBuildBridge {
  gemAvailability: CampaignGemAvailability[];
  unresolved: CampaignGemAvailability[];
  actionsByStep: Record<string, RouteAction[]>;
}

function routeQuestStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function rawQuestTokens(step: CampaignStep): string[] {
  const tokens = step.rawLines.flatMap((line) => [...line.matchAll(/<([^>]+)>/g)].map((match) => match[1]));
  return tokens.map((token) => routeQuestStem(token).replace(/\d+$/g, '')).filter(Boolean);
}

function lineMentionsNpc(line: string, npc: string): boolean {
  const escaped = npc.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  return new RegExp(`(?:^|\\s|\\))${escaped}\\s*:`, 'i').test(line);
}

function stepMentionsNpc(step: CampaignStep, npc: string): boolean {
  return step.rawLines.some((line) => lineMentionsNpc(line, npc));
}

function candidatesForSource(dataset: CampaignDataset, source: GemAcquisitionSource): CampaignStep[] {
  if (!source.questName || !source.act) return [];
  const stem = routeQuestStem(source.questName);
  return dataset.steps.filter((step) => step.act === source.act && rawQuestTokens(step).includes(stem));
}

function resolveNeed(dataset: CampaignDataset, need: GemAcquisitionNeed): CampaignGemAvailability | undefined {
  const source = need.preferred;
  if (!source || source.kind === 'starting') return undefined;
  if (!source.questName || !source.act) {
    return { need, source, confidence: 'unresolved', unlockStepIds: [], reason: 'The selected acquisition source has no campaign quest identity.' };
  }

  const tokenCandidates = candidatesForSource(dataset, source);
  if (!tokenCandidates.length) {
    return { need, source, confidence: 'unresolved', unlockStepIds: [], reason: `No Act ${source.act} route step contains the quest token for “${source.questName}”.` };
  }

  const questNpc = source.questNpc;
  const npcCandidates = questNpc ? tokenCandidates.filter((step) => stepMentionsNpc(step, questNpc)) : [];
  if (npcCandidates.length) {
    return {
      need,
      source,
      confidence: 'exact',
      unlockStepIds: npcCandidates.map((step) => step.id),
      reason: `Matched the maintained quest name and quest NPC against the same Act ${source.act} route step.`,
    };
  }

  if (tokenCandidates.length === 1) {
    return {
      need,
      source,
      confidence: 'unique-token',
      unlockStepIds: [tokenCandidates[0].id],
      reason: `The maintained quest name maps to one unique Act ${source.act} route token.`,
    };
  }

  return {
    need,
    source,
    confidence: 'unresolved',
    unlockStepIds: [],
    reason: `Quest token “${source.questName}” appears on ${tokenCandidates.length} Act ${source.act} route steps and quest-NPC evidence did not disambiguate them.`,
  };
}

function actionForAvailability(availability: CampaignGemAvailability, stepId: string): RouteAction | undefined {
  if (availability.confidence === 'unresolved' || availability.need.stageConfidence === 'ambiguous') return undefined;
  const { need, source } = availability;
  const copies = need.requiredCopies > 1 ? `${need.requiredCopies}× ` : '';
  const verb = source.kind === 'quest' ? 'Take' : 'Buy';
  const npc = source.npc ? ` from ${source.npc}` : '';
  return {
    id: `build-gem:${stepId}:${need.stageId}:${need.requirement.key}`.replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 180),
    type: 'build',
    title: `${verb} ${copies}${need.requirement.name}${npc}`,
    detail: `Needed for ${need.stageTitle}. Source unlock: ${source.questName ?? 'campaign acquisition'}.`,
    target: need.gem?.id,
    priority: 'then',
  };
}

/**
 * Resolves maintained gem quest/vendor availability to the campaign route without mutating the
 * campaign dataset. Exact quest-token + quest-NPC evidence is preferred. Multiple matches are
 * valid when they are conditional variants of the same turn-in; ambiguous token-only matches are
 * left unresolved. The returned build actions are a separate overlay/manager layer.
 */
export function bridgeBuildPlanToCampaign(dataset: CampaignDataset, plan: GemAcquisitionPlan): CampaignBuildBridge {
  const gemAvailability: CampaignGemAvailability[] = [];
  const unresolved: CampaignGemAvailability[] = [];
  const actionsByStep: Record<string, RouteAction[]> = {};

  for (const need of plan.needs) {
    const resolution = resolveNeed(dataset, need);
    if (!resolution) continue;
    gemAvailability.push(resolution);
    if (resolution.confidence === 'unresolved') {
      unresolved.push(resolution);
      continue;
    }
    for (const stepId of resolution.unlockStepIds) {
      const action = actionForAvailability(resolution, stepId);
      if (!action) continue;
      actionsByStep[stepId] = [...(actionsByStep[stepId] ?? []), action];
    }
  }

  for (const actions of Object.values(actionsByStep)) {
    actions.sort((left, right) => left.title.localeCompare(right.title));
  }
  return { gemAvailability, unresolved, actionsByStep };
}

export function campaignBuildActionsForStep(bridge: CampaignBuildBridge, stepId: string): RouteAction[] {
  return bridge.actionsByStep[stepId] ?? [];
}
