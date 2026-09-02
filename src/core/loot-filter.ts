import type { BuildProfile } from './build-profiles';
import { gemIdentity } from './build-transitions';
import { indexGemData, resolveGemRequirement, type GemAcquisitionSnapshot } from './gem-data';
import { alignPobStages } from './pob-stages';

export type LootSocketColour = 'R' | 'G' | 'B';

export interface LootLinkTarget {
  stageId: string;
  stageTitle: string;
  label: string;
  links: number;
  colours: LootSocketColour[];
  gems: string[];
}

export interface LootFilterPlan {
  profileId: string;
  profileName: string;
  stageId?: string;
  stageTitle?: string;
  linkTargets: LootLinkTarget[];
  showChromaticRecipe: boolean;
  showSixSockets: boolean;
  warnings: string[];
}

const ATTRIBUTE_COLOUR: Record<string, LootSocketColour> = {
  str: 'R',
  strength: 'R',
  dex: 'G',
  dexterity: 'G',
  int: 'B',
  intelligence: 'B',
};

function colourFor(attribute: string): LootSocketColour | undefined {
  return ATTRIBUTE_COLOUR[attribute.trim().toLowerCase()];
}

function canonicalColours(colours: LootSocketColour[]): LootSocketColour[] {
  const rank: Record<LootSocketColour, number> = { R: 0, G: 1, B: 2 };
  return [...colours].sort((left, right) => rank[left] - rank[right]);
}

function dedupeTargets(targets: LootLinkTarget[]): LootLinkTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.links}:${target.colours.join('')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildLootFilterPlan(
  profile: BuildProfile,
  activeStageId: string | undefined,
  snapshot: GemAcquisitionSnapshot,
): LootFilterPlan {
  const stages = alignPobStages(profile.build);
  const selected = stages.find((stage) => stage.id === activeStageId) ?? stages.find((stage) => stage.skills?.active) ?? stages[0];
  const index = indexGemData(snapshot);
  const warnings: string[] = [];
  const linkTargets: LootLinkTarget[] = [];

  for (const group of selected?.skills?.skillGroups ?? []) {
    if (!group.enabled) continue;
    const enabled = group.gems.filter((gem) => gem.enabled).slice(0, 6);
    if (enabled.length < 2) continue;
    const colours: LootSocketColour[] = [];
    const names: string[] = [];
    for (const gem of enabled) {
      const resolved = resolveGemRequirement({ key: gemIdentity(gem), name: gem.name, skillId: gem.skillId, count: 1 }, index);
      const colour = resolved ? colourFor(resolved.primaryAttribute) : undefined;
      if (!resolved || !colour) {
        warnings.push(`${gem.name}: socket colour could not be derived from bundled gem metadata.`);
        continue;
      }
      colours.push(colour);
      names.push(gem.name);
    }
    if (colours.length !== enabled.length) continue;
    const canonical = canonicalColours(colours);
    linkTargets.push({
      stageId: selected!.id,
      stageTitle: selected!.title,
      label: group.label?.trim() || names[0] || 'Skill setup',
      links: enabled.length,
      colours: canonical,
      gems: names,
    });
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    stageId: selected?.id,
    stageTitle: selected?.title,
    linkTargets: dedupeTargets(linkTargets).sort((left, right) => right.links - left.links || left.colours.join('').localeCompare(right.colours.join(''))),
    showChromaticRecipe: true,
    showSixSockets: true,
    warnings: [...new Set(warnings)],
  };
}

function colourText(colours: LootSocketColour[]): string {
  return colours.join('');
}

function escapedFilterString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').trim();
}

export function renderLootFilter(plan: LootFilterPlan, baseFilterFileName: string): string {
  if (!baseFilterFileName.toLowerCase().endsWith('.filter')) throw new Error('Base loot filter must use the .filter extension.');
  const lines: string[] = [
    '# ExileQuesting build-aware loot intelligence',
    `# Profile: ${plan.profileName}`,
    `# Stage: ${plan.stageTitle ?? 'No aligned stage'}`,
    '# Generated rules are intentionally narrow. Everything else falls through to your selected base filter.',
    '',
  ];

  for (const target of plan.linkTargets) {
    lines.push(
      'Show',
      `    SocketGroup >= ${target.links}${colourText(target.colours)}`,
      '    SetFontSize 45',
      '    SetBorderColor 239 169 78 255',
      '    SetBackgroundColor 35 24 12 230',
      '    PlayEffect Yellow Temp',
      `    # ${target.label}: ${target.gems.join(' + ')}`,
      '',
    );
  }

  if (plan.showChromaticRecipe) {
    lines.push(
      'Show',
      '    SocketGroup RGB',
      '    SetFontSize 38',
      '    SetBorderColor 117 186 240 255',
      '    # Linked R-G-B item: Chromatic Orb vendor recipe',
      '',
    );
  }

  if (plan.showSixSockets) {
    lines.push(
      'Show',
      '    Sockets 6',
      '    SetFontSize 40',
      '    SetBorderColor 184 155 232 255',
      '    # Six sockets: valuable Jeweller\'s Orb vendor recipe',
      '',
    );
  }

  lines.push(`Import "${escapedFilterString(baseFilterFileName)}"`);
  return `${lines.join('\n').trimEnd()}\n`;
}
