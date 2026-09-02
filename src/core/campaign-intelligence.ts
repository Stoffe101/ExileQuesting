import type { CampaignDataset, RouteAction } from './types';

export interface CampaignIntelligence {
  actionsByStep: Record<string, RouteAction[]>;
}

function action(stepId: string, suffix: string, type: RouteAction['type'], title: string, detail: string, critical = false): RouteAction {
  return {
    id: `intel:${stepId}:${suffix}`.replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 180),
    type,
    title,
    detail,
    priority: 'then',
    critical,
  };
}

function mentionsKitava(step: CampaignDataset['steps'][number]): boolean {
  return step.rawLines.some((line) => /\bkitava\b/i.test(line)) || /\bkitava\b/i.test(step.title);
}

export function buildCampaignIntelligence(dataset: CampaignDataset): CampaignIntelligence {
  const actionsByStep: Record<string, RouteAction[]> = {};
  const areas = new Map(dataset.areas.map((area) => [area.id, area]));

  for (const step of dataset.steps) {
    const actions: RouteAction[] = [];
    const area = step.targetAreaId ? areas.get(step.targetAreaId) : undefined;
    if (area?.crafting_recipe && !step.actions.some((candidate) => candidate.type === 'craft')) {
      actions.push(action(
        step.id,
        'craft-recipe',
        'craft',
        `Unlock crafting recipe: ${area.crafting_recipe}`,
        'This recipe is permanently added to the Crafting Bench when you interact with it in the area.',
      ));
    }

    if ((step.act === 5 || step.act === 10) && mentionsKitava(step)) {
      const penalty = step.act === 5 ? '-30%' : '-60% total';
      actions.push(action(
        step.id,
        'kitava-resists',
        'craft',
        'Patch elemental resistances before Kitava',
        `Kitava leaves you at ${penalty} resistance penalty after this encounter. Use spare suffixes and unlocked bench crafts to avoid entering the next progression tier with broken resistances.`,
        true,
      ));
    }

    if (actions.length) actionsByStep[step.id] = actions;
  }

  return { actionsByStep };
}

export function campaignIntelligenceActionsForStep(intelligence: CampaignIntelligence, stepId: string): RouteAction[] {
  return intelligence.actionsByStep[stepId] ?? [];
}
