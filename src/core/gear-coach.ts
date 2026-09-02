import type { BuildProfile } from './build-profiles';
import { elementalResistanceTotal, parsePoeItemText, slotFromPobSlot, type ParsedPoeItem, type PoeGearSlot } from './item-text';
import type { GemAcquisitionSnapshot } from './gem-data';
import { buildLootFilterPlan } from './loot-filter';
import { alignPobStages, parsePobStageMilestone } from './pob-stages';
import type { PobItemSummary } from './pob';

export type GearCoachVerdict = 'excellent' | 'good' | 'situational' | 'skip' | 'future';
export type GearCoachReasonTone = 'positive' | 'warning' | 'neutral';

export interface GearCoachReason {
  tone: GearCoachReasonTone;
  label: string;
}

export interface GearCoachTarget {
  stageTitle: string;
  slot: PoeGearSlot;
  slotName: string;
  name?: string;
  baseType?: string;
  rarity?: string;
}

export interface GearCoachAnalysis {
  item: ParsedPoeItem;
  score: number;
  verdict: GearCoachVerdict;
  headline: string;
  stageTitle?: string;
  stageLevel?: number;
  characterLevel?: number;
  desiredLinks?: number;
  target?: GearCoachTarget;
  reasons: GearCoachReason[];
  repairHints: string[];
  lookFor: string[];
}

export interface GearLookForHint {
  slot?: PoeGearSlot;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

function selectedStage(profile: BuildProfile, activeStageId?: string) {
  const stages = alignPobStages(profile.build);
  return stages.find((stage) => stage.id === activeStageId)
    ?? stages.find((stage) => [stage.tree, stage.skills, stage.items, stage.config].some((member) => member?.active))
    ?? stages[0];
}

function stageLevel(profile: BuildProfile, stageTitle?: string): number | undefined {
  const milestone = stageTitle ? parsePobStageMilestone(stageTitle) : undefined;
  if (milestone?.kind === 'level' && typeof milestone.value === 'number') return milestone.value;
  return profile.build.level;
}

function targetForSlot(profile: BuildProfile, activeStageId: string | undefined, slot: PoeGearSlot): PobItemSummary | undefined {
  const stage = selectedStage(profile, activeStageId);
  const items = stage?.items?.equipment ?? [];
  return items.find((item) => item.slot === slot)
    ?? items.find((item) => slotFromPobSlot(item.slotName) === slot);
}

function maxrollTargetName(profile: BuildProfile, slot: PoeGearSlot, candidateName: string): string | undefined {
  const normalizedCandidate = candidateName.trim().toLowerCase();
  for (const milestone of profile.maxroll?.equipmentMilestones ?? []) {
    for (const item of milestone.slots) {
      if (slotFromPobSlot(item.slot) !== slot || !item.name) continue;
      if (item.name.trim().toLowerCase() === normalizedCandidate) return item.name;
    }
  }
  return undefined;
}

function cap(value: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, value));
}

function ratioScore(value: number, target: number, points: number): number {
  if (target <= 0) return 0;
  return cap(value / target, 1) * points;
}

function lifeTarget(level: number): number {
  if (level < 20) return 30;
  if (level < 40) return 50;
  if (level < 60) return 70;
  return 90;
}

function resistanceTarget(level: number): number {
  if (level < 20) return 30;
  if (level < 40) return 55;
  if (level < 60) return 75;
  return 95;
}

function movementTarget(level: number): number {
  return level < 25 ? 15 : level < 50 ? 20 : 25;
}

function isArmourSlot(slot: PoeGearSlot): boolean {
  return ['helmet', 'body-armour', 'gloves', 'boots'].includes(slot);
}

function isJewellery(slot: PoeGearSlot): boolean {
  return ['belt', 'amulet', 'ring'].includes(slot);
}

function canCarryMainLinks(slot: PoeGearSlot): boolean {
  return ['helmet', 'body-armour', 'gloves', 'boots', 'weapon', 'offhand'].includes(slot);
}

function defensiveRating(item: ParsedPoeItem): number {
  return item.stats.armour + item.stats.evasion + item.stats.energyShield * 3 + item.stats.ward * 4;
}

function offensiveSignals(item: ParsedPoeItem): number {
  return item.stats.increasedDamage + item.stats.attackSpeed + item.stats.castSpeed + item.stats.gemLevels * 35;
}

function targetSummary(item: PobItemSummary | undefined, stageTitle: string | undefined): GearCoachTarget | undefined {
  if (!item || !stageTitle) return undefined;
  return {
    stageTitle,
    slot: item.slot,
    slotName: item.slotName,
    name: item.rarity?.toLowerCase() === 'unique' ? item.name : undefined,
    baseType: item.baseType !== 'Unknown base' ? item.baseType : undefined,
    rarity: item.rarity,
  };
}

function comparableTargetScore(candidate: ParsedPoeItem, target: PobItemSummary | undefined): { points: number; reasons: GearCoachReason[] } {
  if (!target) return { points: 0, reasons: [] };
  let points = 0;
  const reasons: GearCoachReason[] = [];
  if (target.rarity?.toLowerCase() === 'unique' && candidate.name.toLowerCase() === target.name.toLowerCase()) {
    points += 25;
    reasons.push({ tone: 'positive', label: `Exact PoB target: ${target.name}.` });
  } else if (target.baseType !== 'Unknown base' && candidate.baseType.toLowerCase() === target.baseType.toLowerCase()) {
    points += 14;
    reasons.push({ tone: 'positive', label: `Matches the PoB target base: ${target.baseType}.` });
  }

  if (target.stats.maximumLife > 0 && candidate.stats.maximumLife >= target.stats.maximumLife * 0.8) points += 4;
  const targetRes = elementalResistanceTotal(target);
  if (targetRes > 0 && elementalResistanceTotal(candidate) >= targetRes * 0.8) points += 4;
  if (target.stats.movementSpeed > 0 && candidate.stats.movementSpeed >= target.stats.movementSpeed) points += 4;
  if (target.maxLinks > 1 && candidate.maxLinks >= target.maxLinks) points += 4;
  return { points, reasons };
}

function verdictFor(score: number, usableNow: boolean): GearCoachVerdict {
  if (!usableNow) return 'future';
  if (score >= 78) return 'excellent';
  if (score >= 58) return 'good';
  if (score >= 38) return 'situational';
  return 'skip';
}

function headlineFor(verdict: GearCoachVerdict, item: ParsedPoeItem): string {
  if (verdict === 'excellent') return `Equip-worthy ${item.slot === 'unknown' ? 'item' : item.slot.replace('-', ' ')} for this stage`;
  if (verdict === 'good') return 'Good leveling fit';
  if (verdict === 'situational') return 'Useful if it fixes a current gap';
  if (verdict === 'future') return 'Save it for later';
  return 'Low priority for this build stage';
}

export function gearLookForHints(profile: BuildProfile, activeStageId: string | undefined, gemData: GemAcquisitionSnapshot): GearLookForHint[] {
  const stage = selectedStage(profile, activeStageId);
  const level = stageLevel(profile, stage?.title) ?? 1;
  const loot = buildLootFilterPlan(profile, activeStageId, gemData);
  const hints: GearLookForHint[] = [];
  for (const item of stage?.items?.equipment ?? []) {
    if (item.slot === 'flask' || item.slot === 'jewel' || item.slot === 'unknown') continue;
    if (item.rarity?.toLowerCase() === 'unique') hints.push({ slot: item.slot, label: `${item.slotName}: ${item.name}`, priority: 'high' });
    else if (item.baseType !== 'Unknown base') hints.push({ slot: item.slot, label: `${item.slotName}: ${item.baseType}`, priority: 'medium' });
  }
  for (const milestone of profile.maxroll?.equipmentMilestones ?? []) {
    for (const item of milestone.slots) if (item.name) hints.push({ slot: slotFromPobSlot(item.slot), label: `${item.slot}: ${item.name}`, priority: 'high' });
  }
  const bestLink = loot.linkTargets[0]?.links;
  if (bestLink) hints.push({ label: `Any usable ${bestLink}-link for the main setup; colours are only a quality bonus in PoE 3.29.`, priority: 'high' });
  hints.push({ label: `Rare gear: aim for roughly ${lifeTarget(level)}+ life and useful elemental resistances per defensive slot.`, priority: 'medium' });
  hints.push({ slot: 'boots', label: `Boots: ${movementTarget(level)}%+ movement speed is a major campaign upgrade.`, priority: 'high' });
  return hints.filter((hint, index, all) => all.findIndex((candidate) => candidate.label === hint.label) === index).slice(0, 12);
}

export function analyzeGearItem(
  rawItemText: string,
  profile: BuildProfile,
  activeStageId: string | undefined,
  gemData: GemAcquisitionSnapshot,
  characterLevel?: number,
): GearCoachAnalysis {
  const item = parsePoeItemText(rawItemText);
  const stage = selectedStage(profile, activeStageId);
  const level = stageLevel(profile, stage?.title) ?? characterLevel ?? 1;
  const target = targetForSlot(profile, activeStageId, item.slot);
  const loot = buildLootFilterPlan(profile, activeStageId, gemData);
  const desiredLinks = canCarryMainLinks(item.slot) ? loot.linkTargets[0]?.links : undefined;
  const reasons: GearCoachReason[] = [];
  const repairHints: string[] = [];
  let score = 10;

  const targetComparison = comparableTargetScore(item, target);
  score += targetComparison.points;
  reasons.push(...targetComparison.reasons);
  const twinkExact = maxrollTargetName(profile, item.slot, item.name);
  if (twinkExact) {
    score += 25;
    reasons.push({ tone: 'positive', label: `Matches a Maxroll Twink equipment target: ${twinkExact}.` });
  }

  const elementalRes = elementalResistanceTotal(item);
  const life = item.stats.maximumLife;
  const attributes = item.stats.strength + item.stats.dexterity + item.stats.intelligence + item.stats.allAttributes * 3;

  if (item.slot === 'weapon') {
    const offense = offensiveSignals(item);
    score += ratioScore(offense, level < 35 ? 35 : 70, 30);
    if (offense > 0) reasons.push({ tone: 'positive', label: `Offensive modifiers detected (${Math.round(offense)} weighted power).` });
    else reasons.push({ tone: 'warning', label: 'No obvious attack/cast/damage/gem-level modifier was detected on this weapon.' });
    score += ratioScore(attributes, 35, 8);
  } else {
    score += ratioScore(life, lifeTarget(level), isJewellery(item.slot) ? 22 : 26);
    score += ratioScore(elementalRes, resistanceTarget(level), 24);
    score += ratioScore(attributes, level < 40 ? 30 : 45, 8);
    if (life >= lifeTarget(level)) reasons.push({ tone: 'positive', label: `${life} maximum Life is strong for this stage.` });
    else if (life > 0) reasons.push({ tone: 'neutral', label: `${life} maximum Life helps, but ${lifeTarget(level)}+ is a stronger target around this stage.` });
    else if (!['flask', 'jewel'].includes(item.slot)) reasons.push({ tone: 'warning', label: 'No maximum Life modifier detected.' });
    if (elementalRes >= resistanceTarget(level)) reasons.push({ tone: 'positive', label: `${elementalRes}% combined elemental resistance value is useful.` });
    else if (elementalRes > 0) reasons.push({ tone: 'neutral', label: `${elementalRes}% combined elemental resistance value helps cover campaign penalties.` });
  }

  if (item.slot === 'boots') {
    score += ratioScore(item.stats.movementSpeed, movementTarget(level), 18);
    if (item.stats.movementSpeed >= movementTarget(level)) reasons.push({ tone: 'positive', label: `${item.stats.movementSpeed}% movement speed is excellent campaign tempo.` });
    else reasons.push({ tone: 'warning', label: `Look for ${movementTarget(level)}%+ movement speed on boots.` });
  } else if (isArmourSlot(item.slot)) {
    const defence = defensiveRating(item);
    score += ratioScore(defence, Math.max(100, level * 12), 8);
    if (defence > 0) reasons.push({ tone: 'neutral', label: `${defence} weighted local defensive rating detected.` });
  }

  if (desiredLinks && desiredLinks >= 3) {
    score += ratioScore(item.maxLinks, desiredLinks, 14);
    if (item.maxLinks >= desiredLinks) reasons.push({ tone: 'positive', label: `${item.maxLinks}-link satisfies the active main-skill link target.` });
    else if (item.maxLinks > 0) reasons.push({ tone: 'warning', label: `${item.maxLinks}-link is below the current ${desiredLinks}-link build target.` });
  }

  const requiredLevel = item.requirements.level;
  const usableNow = !requiredLevel || !characterLevel || requiredLevel <= characterLevel;
  if (!usableNow) {
    score -= 18;
    reasons.unshift({ tone: 'warning', label: `Requires level ${requiredLevel}; current detected character level is ${characterLevel}.` });
  }
  if (item.unidentified) reasons.unshift({ tone: 'warning', label: 'Unidentified item: hidden modifiers cannot be scored yet.' });
  if (item.corrupted) reasons.push({ tone: 'warning', label: 'Corrupted item: normal Crafting Bench repairs are unavailable.' });
  if (item.slot === 'unknown') reasons.unshift({ tone: 'warning', label: 'Gear slot could not be identified, so the score is less reliable.' });

  score = Math.round(cap(score, 100));
  const verdict = verdictFor(score, usableNow);

  if (!item.corrupted && !['weapon', 'flask', 'jewel', 'unknown'].includes(item.slot)) {
    if (life < lifeTarget(level) * 0.65) repairHints.push(`If an open prefix is available, a crafted maximum-Life roll is a cheap way to rescue this item.`);
    if (elementalRes < resistanceTarget(level) * 0.65) repairHints.push('If an open suffix is available, craft the elemental resistance you are missing most.');
  }
  if (!item.corrupted && item.slot === 'boots' && item.stats.movementSpeed === 0) repairHints.push('Boots without movement speed are usually temporary; prefer a movement-speed pair rather than spending much currency here.');

  const lookFor = gearLookForHints(profile, activeStageId, gemData).map((hint) => hint.label).slice(0, 6);
  return {
    item,
    score,
    verdict,
    headline: headlineFor(verdict, item),
    stageTitle: stage?.title,
    stageLevel: level,
    characterLevel,
    desiredLinks,
    target: targetSummary(target, stage?.title),
    reasons: reasons.slice(0, 10),
    repairHints: repairHints.slice(0, 4),
    lookFor,
  };
}
