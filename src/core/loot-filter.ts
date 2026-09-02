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
  /** Matching non-white socket colours grant +10% gem quality in PoE 3.29; they are not equip requirements. */
  qualityBonusColours: LootSocketColour[];
  gems: string[];
}

export interface LootFilterPlan {
  profileId: string;
  profileName: string;
  gameVersion: string;
  stageId?: string;
  stageTitle?: string;
  linkTargets: LootLinkTarget[];
  showChromaticRecipe: boolean;
  showSixSockets: boolean;
  warnings: string[];
}

export interface LootFilterStatus {
  basePath?: string;
  outputPath?: string;
  generatedAt?: string;
  fingerprint?: string;
  needsReload: boolean;
  status: 'unconfigured' | 'ready' | 'error';
  message: string;
}

const ATTRIBUTE_COLOUR: Record<string, LootSocketColour> = {
  str: 'R',
  strength: 'R',
  dex: 'G',
  dexterity: 'G',
  int: 'B',
  intelligence: 'B',
};

const LEVELING_AREA_MAX = 67;

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
    const key = `${target.links}:${target.qualityBonusColours.join('')}`;
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
        warnings.push(`${gem.name}: matching quality-bonus socket colour could not be derived from bundled gem metadata.`);
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
      qualityBonusColours: canonical,
      gems: names,
    });
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    gameVersion: snapshot.gameVersion,
    stageId: selected?.id,
    stageTitle: selected?.title,
    linkTargets: dedupeTargets(linkTargets).sort((left, right) => right.links - left.links || left.qualityBonusColours.join('').localeCompare(right.qualityBonusColours.join(''))),
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

function levelingScope(lines: string[]): void {
  lines.push(`    AreaLevel <= ${LEVELING_AREA_MAX}`);
}

export function renderLootFilterPassthrough(baseFilterFileName: string): string {
  if (!baseFilterFileName.toLowerCase().endsWith('.filter')) throw new Error('Base loot filter must use the .filter extension.');
  return [
    '# ExileQuesting build-aware loot intelligence',
    '# No active Build Profile. ExileQuesting is intentionally adding no item rules.',
    `Import "${escapedFilterString(baseFilterFileName)}"`,
    '',
  ].join('\n');
}

export function renderLootFilter(plan: LootFilterPlan, baseFilterFileName: string): string {
  if (!baseFilterFileName.toLowerCase().endsWith('.filter')) throw new Error('Base loot filter must use the .filter extension.');
  const lines: string[] = [
    '# ExileQuesting build-aware leveling loot intelligence',
    `# Profile: ${plan.profileName}`,
    `# Stage: ${plan.stageTitle ?? 'No aligned stage'}`,
    `# PoE: ${plan.gameVersion}`,
    '# PoE 3.29: socket colour does not gate gem placement. Matching non-white colours only grant +10% gem quality.',
    '# Generated rules are campaign-scoped and intentionally narrow. Everything else falls through to your selected base filter.',
    '',
  ];

  for (const target of plan.linkTargets) {
    // Matching non-white colours are a quality optimisation in 3.29, not a requirement to use the links.
    lines.push('Show');
    levelingScope(lines);
    lines.push(
      `    SocketGroup >= ${target.links}${colourText(target.qualityBonusColours)}`,
      '    SetFontSize 45',
      '    SetBorderColor 239 169 78 255',
      '    SetBackgroundColor 35 24 12 230',
      '    PlayEffect Yellow Temp',
      `    # QUALITY BONUS MATCH · ${target.label}: ${target.gems.join(' + ')}`,
      '',
    );

    // A correctly linked white/mismatched item is fully usable in 3.29, so never hide it behind colour matching.
    if (target.links >= 3) {
      lines.push('Show');
      levelingScope(lines);
      lines.push(
        `    LinkedSockets >= ${target.links}`,
        '    SetFontSize 42',
        '    SetBorderColor 218 196 137 255',
        `    # USABLE LINK TARGET · ${target.label}: colours are optional for gem compatibility in PoE 3.29`,
        '',
      );
    }
  }

  if (plan.showChromaticRecipe) {
    lines.push('Show');
    levelingScope(lines);
    lines.push(
      '    SocketGroup RGB',
      '    SetFontSize 38',
      '    SetBorderColor 117 186 240 255',
      '    # Linked R-G-B item: Chromatic Orb vendor recipe',
      '',
    );
  }

  if (plan.showSixSockets) {
    lines.push('Show');
    levelingScope(lines);
    lines.push(
      '    LinkedSockets 6',
      '    SetFontSize 45',
      '    SetBorderColor 239 169 78 255',
      '    PlayEffect Yellow Temp',
      '    # Six-linked item: 20 Orbs of Fusing vendor recipe; inspect before vendoring',
      '',
      'Show',
    );
    levelingScope(lines);
    lines.push(
      '    Sockets 6',
      '    SetFontSize 40',
      '    SetBorderColor 184 155 232 255',
      "    # Six sockets: 7 Jeweller's Orbs vendor recipe when not six-linked",
      '',
    );
  }

  lines.push(`Import "${escapedFilterString(baseFilterFileName)}"`);
  return `${lines.join('\n').trimEnd()}\n`;
}
