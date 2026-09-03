import type { CampaignDataset, RouteAction } from './types';

export interface CampaignIntelligence {
  actionsByStep: Record<string, RouteAction[]>;
}

const REMOVED_329_CRAFTING_RECIPES = new Set([
  // PoE 3.29 removed the fixed red/green/blue socket-colour bench crafts and replaced them with
  // default-unlocked non-white socket crafts. Older campaign snapshots can still carry this label.
  'socket colours',
]);

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

function routeText(step: CampaignDataset['steps'][number]): string {
  return `${step.title} ${step.rawLines.join(' ')}`.toLowerCase();
}

function mentionsKitava(step: CampaignDataset['steps'][number]): boolean {
  return /\bkitava\b/i.test(routeText(step));
}

function currentCraftingRecipe(value: string | undefined): string | undefined {
  const recipe = value?.trim();
  if (!recipe || REMOVED_329_CRAFTING_RECIPES.has(recipe.toLowerCase())) return undefined;
  return recipe;
}

export function buildCampaignIntelligence(dataset: CampaignDataset): CampaignIntelligence {
  const actionsByStep: Record<string, RouteAction[]> = {};
  const areas = new Map(dataset.areas.map((area) => [area.id, area]));
  let announcedTownBench = false;
  let announcedSiosa = false;
  let announcedLilly = false;

  for (const step of dataset.steps) {
    const actions: RouteAction[] = [];
    const area = step.targetAreaId ? areas.get(step.targetAreaId) : undefined;
    const craftingRecipe = currentCraftingRecipe(area?.crafting_recipe);
    const text = routeText(step);

    if (!announcedTownBench && step.act >= 2 && step.targetAreaId?.endsWith('_town')) {
      announcedTownBench = true;
      actions.push(action(
        step.id,
        'town-bench',
        'craft',
        'Crafting Bench is available in town',
        'PoE 3.29 places a Crafting Bench in every town from Act 2 onward, so you can patch life, resistances and other unlocked modifiers without returning to a hideout.',
      ));
    }

    if (craftingRecipe && !step.actions.some((candidate) => candidate.type === 'craft')) {
      actions.push(action(
        step.id,
        'craft-recipe',
        'craft',
        `Unlock crafting recipe: ${craftingRecipe}`,
        'This recipe is permanently added to the Crafting Bench when you interact with it in the area.',
      ));
    }

    if (!announcedSiosa && /\bsiosa\b/.test(text) && /a_fixture_of_fate|fixture of fate/.test(text)) {
      announcedSiosa = true;
      actions.push(action(
        step.id,
        'siosa-gems',
        'gem',
        'Siosa becomes your early broad gem fallback',
        'After A Fixture of Fate, Siosa can sell a broad pool of early skill and support gems in the Library. Bring the currency you need into the zone because this vendor is outside town.',
      ));
    }

    if (!announcedLilly && /\blilly\b/.test(text) && /fallen_from_grace|fallen from grace/.test(text)) {
      announcedLilly = true;
      actions.push(action(
        step.id,
        'lilly-gems',
        'gem',
        'Lilly becomes your long-term gem vendor',
        'After Fallen from Grace, Lilly is the main broad gem fallback for later build swaps and can also be used from your hideout. Re-check the active build stage here if several gems change at once.',
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
