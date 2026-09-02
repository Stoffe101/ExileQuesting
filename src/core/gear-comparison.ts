import type { GearCoachAnalysis, GearCoachReason } from './gear-coach';
import { elementalResistanceTotal, type ParsedPoeItem, type PoeGearSlot } from './item-text';

export type GearComparisonVerdict = 'upgrade' | 'sidegrade' | 'downgrade' | 'future' | 'different-slot';
export type GearComparisonTone = 'positive' | 'negative' | 'neutral';

export interface GearComparisonDelta {
  key: 'life' | 'elemental-resistance' | 'movement-speed' | 'links' | 'defence' | 'offence';
  label: string;
  candidate: number;
  equipped: number;
  delta: number;
  suffix?: string;
  tone: GearComparisonTone;
}

export interface GearCoachComparison {
  verdict: GearComparisonVerdict;
  headline: string;
  scoreDelta: number;
  candidate: GearCoachAnalysis;
  equipped: GearCoachAnalysis;
  deltas: GearComparisonDelta[];
  reasons: GearCoachReason[];
}

function slotLabel(slot: PoeGearSlot): string {
  return slot === 'body-armour' ? 'body armour' : slot.replace('-', ' ');
}

function isArmourSlot(slot: PoeGearSlot): boolean {
  return ['helmet', 'body-armour', 'gloves', 'boots'].includes(slot);
}

function canCarryLinks(slot: PoeGearSlot): boolean {
  return ['helmet', 'body-armour', 'gloves', 'boots', 'weapon', 'offhand'].includes(slot);
}

function defensiveRating(item: ParsedPoeItem): number {
  return item.stats.armour + item.stats.evasion + item.stats.energyShield * 3 + item.stats.ward * 4;
}

function offensiveSignals(item: ParsedPoeItem): number {
  return item.stats.increasedDamage + item.stats.attackSpeed + item.stats.castSpeed + item.stats.gemLevels * 35;
}

function delta(
  key: GearComparisonDelta['key'],
  label: string,
  candidate: number,
  equipped: number,
  suffix?: string,
): GearComparisonDelta {
  const difference = candidate - equipped;
  return {
    key,
    label,
    candidate,
    equipped,
    delta: difference,
    suffix,
    tone: difference > 0 ? 'positive' : difference < 0 ? 'negative' : 'neutral',
  };
}

function buildDeltas(candidate: ParsedPoeItem, equipped: ParsedPoeItem): GearComparisonDelta[] {
  const result: GearComparisonDelta[] = [];

  if (candidate.slot === 'weapon') {
    result.push(delta('offence', 'Visible offence', offensiveSignals(candidate), offensiveSignals(equipped)));
  } else {
    result.push(delta('life', 'Life', candidate.stats.maximumLife, equipped.stats.maximumLife));
    result.push(delta(
      'elemental-resistance',
      'Elemental res',
      elementalResistanceTotal(candidate),
      elementalResistanceTotal(equipped),
      '%',
    ));
  }

  if (candidate.slot === 'boots') {
    result.push(delta('movement-speed', 'Move speed', candidate.stats.movementSpeed, equipped.stats.movementSpeed, '%'));
  }

  if (isArmourSlot(candidate.slot)) {
    result.push(delta('defence', 'Local defence', defensiveRating(candidate), defensiveRating(equipped)));
  }

  if (canCarryLinks(candidate.slot) && (candidate.maxLinks > 0 || equipped.maxLinks > 0)) {
    result.push(delta('links', 'Links', candidate.maxLinks, equipped.maxLinks));
  }

  return result;
}

function deltaReason(item: GearComparisonDelta): GearCoachReason | undefined {
  if (item.delta === 0) return undefined;
  const amount = `${Math.abs(item.delta)}${item.suffix ?? ''}`;
  if (item.delta > 0) return { tone: 'positive', label: `Candidate gains ${amount} ${item.label.toLowerCase()}.` };
  return { tone: 'warning', label: `Candidate gives up ${amount} ${item.label.toLowerCase()}.` };
}

function headline(verdict: GearComparisonVerdict, equippedName: string): string {
  if (verdict === 'upgrade') return `Clear upgrade over ${equippedName}`;
  if (verdict === 'downgrade') return 'Current item still looks stronger';
  if (verdict === 'future') return 'Potential upgrade later, but not usable yet';
  if (verdict === 'different-slot') return 'Compare items from the same gear slot';
  return 'Sidegrade: choose the stats you need most';
}

export function compareGearAnalyses(candidate: GearCoachAnalysis, equipped: GearCoachAnalysis): GearCoachComparison {
  const scoreDelta = candidate.score - equipped.score;
  const candidateSlot = candidate.item.slot;
  const equippedSlot = equipped.item.slot;

  if (candidateSlot === 'unknown' || equippedSlot === 'unknown' || candidateSlot !== equippedSlot) {
    return {
      verdict: 'different-slot',
      headline: headline('different-slot', equipped.item.name),
      scoreDelta,
      candidate,
      equipped,
      deltas: [],
      reasons: [{
        tone: 'warning',
        label: `The candidate is ${slotLabel(candidateSlot)} while the equipped reference is ${slotLabel(equippedSlot)}. Capture the item currently worn in the same slot before comparing.`,
      }],
    };
  }

  const deltas = buildDeltas(candidate.item, equipped.item);
  const metricReasons = deltas
    .filter((item) => item.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 4)
    .map(deltaReason)
    .filter((reason): reason is GearCoachReason => Boolean(reason));

  if (candidate.verdict === 'future') {
    return {
      verdict: 'future',
      headline: headline('future', equipped.item.name),
      scoreDelta,
      candidate,
      equipped,
      deltas,
      reasons: [
        { tone: 'warning', label: 'The candidate cannot be equipped at the currently detected character level, so this is not a current upgrade.' },
        ...metricReasons,
      ].slice(0, 6),
    };
  }

  const verdict: GearComparisonVerdict = scoreDelta >= 8
    ? 'upgrade'
    : scoreDelta <= -8
      ? 'downgrade'
      : 'sidegrade';

  const scoreReason: GearCoachReason = verdict === 'upgrade'
    ? { tone: 'positive', label: `Build-stage score improves by ${scoreDelta} points (${equipped.score} → ${candidate.score}).` }
    : verdict === 'downgrade'
      ? { tone: 'warning', label: `Build-stage score drops by ${Math.abs(scoreDelta)} points (${equipped.score} → ${candidate.score}).` }
      : { tone: 'neutral', label: `Build-stage scores are close (${equipped.score} → ${candidate.score}); treat this as a stat trade rather than a guaranteed upgrade.` };

  const reasons = [scoreReason, ...metricReasons];
  if (metricReasons.length === 0) {
    reasons.push({ tone: 'neutral', label: 'No meaningful visible stat difference was detected in the comparison signals Gear Coach currently understands.' });
  }

  return {
    verdict,
    headline: headline(verdict, equipped.item.name),
    scoreDelta,
    candidate,
    equipped,
    deltas,
    reasons: reasons.slice(0, 6),
  };
}
