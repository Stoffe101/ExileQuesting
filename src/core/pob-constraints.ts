import type { PobCalculationKernelVersion, PobConstraintMetrics, PobReplaceableItemSlot } from './pob-calculation';
import { POB_REPLACEABLE_ITEM_SLOTS } from './pob-calculation';

export const POB_CONSTRAINT_PROTOCOL_VERSION = 1;
export const POB_CONSTRAINT_WORKER_SENTINEL = '@@EXILEQUESTING_POB_CONSTRAINT@@';
export const MAX_POB_CONSTRAINT_ITEM_TEXT_BYTES = 128 * 1024;

export interface PobConstraintHealthRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'health';
}

export interface PobConstraintInspectBuildRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'inspect-build-constraints';
  xml: string;
}

export interface PobConstraintCompareItemRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'compare-item-constraints';
  xml: string;
  slot: PobReplaceableItemSlot;
  itemText: string;
}

export type PobConstraintRequest = PobConstraintHealthRequest | PobConstraintInspectBuildRequest | PobConstraintCompareItemRequest;

export interface PobConstraintComparison {
  slot: PobReplaceableItemSlot;
  before: PobConstraintMetrics;
  after: PobConstraintMetrics;
}

export interface PobConstraintWorkerSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  kernel: PobCalculationKernelVersion;
  comparison: PobConstraintComparison;
}

export interface PobConstraintWorkerInspectionSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  kernel: PobCalculationKernelVersion;
  inspection: { metrics: PobConstraintMetrics };
}

export interface PobConstraintWorkerHealthSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  health: { status: 'ready'; kernel: PobCalculationKernelVersion };
}

export interface PobConstraintWorkerFailure {
  protocolVersion: number;
  requestId?: string;
  ok: false;
  error: { code: string; message: string; retryable: boolean };
}

export type PobConstraintWorkerResponse = PobConstraintWorkerSuccess | PobConstraintWorkerInspectionSuccess | PobConstraintWorkerHealthSuccess | PobConstraintWorkerFailure;

export type PobConstraintFindingState = 'broken' | 'repaired' | 'weakened-buffer' | 'improved-buffer';
export type PobConstraintFindingKind = 'attribute-requirement' | 'resistance-cap' | 'spell-suppression-cap';

export interface PobConstraintFinding {
  key: string;
  kind: PobConstraintFindingKind;
  state: PobConstraintFindingState;
  label: string;
  before: string;
  after: string;
  detail: string;
}

export type PobBaselineConstraintFindingSeverity = 'warning' | 'info';
export type PobBaselineConstraintFindingKind = 'attribute-requirement' | 'elemental-resistance-cap' | 'chaos-resistance-posture' | 'spell-suppression-posture';

export interface PobBaselineConstraintFinding {
  key: string;
  kind: PobBaselineConstraintFindingKind;
  severity: PobBaselineConstraintFindingSeverity;
  label: string;
  value: string;
  detail: string;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function validPobConstraintRequest(request: PobConstraintRequest): boolean {
  if (request.protocolVersion !== POB_CONSTRAINT_PROTOCOL_VERSION) return false;
  if (!request.requestId.trim() || request.requestId.length > 128) return false;
  if (request.operation === 'health') return true;
  if (!request.xml.trim() || request.xml.length > 16 * 1024 * 1024) return false;
  if (request.operation === 'inspect-build-constraints') return true;
  return POB_REPLACEABLE_ITEM_SLOTS.includes(request.slot)
    && Boolean(request.itemText.trim())
    && utf8ByteLength(request.itemText) <= MAX_POB_CONSTRAINT_ITEM_TEXT_BYTES;
}

export function parsePobConstraintProtocolLines(stdout: string): PobConstraintWorkerResponse[] {
  const responses: PobConstraintWorkerResponse[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(POB_CONSTRAINT_WORKER_SENTINEL)) continue;
    const payload = line.slice(POB_CONSTRAINT_WORKER_SENTINEL.length);
    if (payload) responses.push(JSON.parse(payload) as PobConstraintWorkerResponse);
  }
  return responses;
}

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function value(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function requirementFinding(
  key: string,
  label: string,
  before: { current?: number; required?: number },
  after: { current?: number; required?: number },
): PobConstraintFinding | undefined {
  if (!finite(before.current) || !finite(before.required) || !finite(after.current) || !finite(after.required)) return undefined;
  const beforeSatisfied = before.current >= before.required;
  const afterSatisfied = after.current >= after.required;
  if (beforeSatisfied === afterSatisfied) return undefined;
  const state: PobConstraintFindingState = beforeSatisfied ? 'broken' : 'repaired';
  return {
    key,
    kind: 'attribute-requirement',
    state,
    label,
    before: `${value(before.current)} / ${value(before.required)} required`,
    after: `${value(after.current)} / ${value(after.required)} required`,
    detail: state === 'broken'
      ? `The candidate makes PoB's ${label.toLowerCase()} requirement unsatisfied.`
      : `The candidate repairs PoB's previously unsatisfied ${label.toLowerCase()} requirement.`,
  };
}

function resistanceFinding(
  key: string,
  label: string,
  before: { current?: number; overCap?: number; missing?: number },
  after: { current?: number; overCap?: number; missing?: number },
): PobConstraintFinding | undefined {
  if (!finite(before.missing) || !finite(after.missing)) return undefined;
  const beforeSatisfied = before.missing <= 1e-9;
  const afterSatisfied = after.missing <= 1e-9;
  if (beforeSatisfied !== afterSatisfied) {
    const state: PobConstraintFindingState = beforeSatisfied ? 'broken' : 'repaired';
    return {
      key,
      kind: 'resistance-cap',
      state,
      label,
      before: beforeSatisfied ? `cap met${finite(before.overCap) ? ` (+${value(before.overCap)} over)` : ''}` : `${value(before.missing)} missing`,
      after: afterSatisfied ? `cap met${finite(after.overCap) ? ` (+${value(after.overCap)} over)` : ''}` : `${value(after.missing)} missing`,
      detail: state === 'broken'
        ? `The candidate makes PoB report missing ${label.toLowerCase()} relative to the build's calculated cap.`
        : `The candidate restores PoB's calculated ${label.toLowerCase()} cap.`,
    };
  }
  if (!beforeSatisfied || !finite(before.overCap) || !finite(after.overCap) || Math.abs(after.overCap - before.overCap) <= 1e-9) return undefined;
  const state: PobConstraintFindingState = after.overCap < before.overCap ? 'weakened-buffer' : 'improved-buffer';
  return {
    key,
    kind: 'resistance-cap',
    state,
    label,
    before: `cap met (+${value(before.overCap)} over)`,
    after: `cap met (+${value(after.overCap)} over)`,
    detail: state === 'weakened-buffer'
      ? `The candidate keeps PoB's ${label.toLowerCase()} cap satisfied but reduces its overcap buffer.`
      : `The candidate increases PoB's ${label.toLowerCase()} overcap buffer.`,
  };
}

function suppressionFinding(before: PobConstraintMetrics['spellSuppression'], after: PobConstraintMetrics['spellSuppression']): PobConstraintFinding | undefined {
  if (!finite(before.chance) || !finite(before.cap) || !finite(after.chance) || !finite(after.cap)) return undefined;
  if (Math.abs(before.cap - after.cap) > 1e-9) return undefined;
  const beforeSatisfied = before.chance >= before.cap;
  const afterSatisfied = after.chance >= after.cap;
  if (beforeSatisfied !== afterSatisfied) {
    const state: PobConstraintFindingState = beforeSatisfied ? 'broken' : 'repaired';
    return {
      key: 'spell-suppression-cap',
      kind: 'spell-suppression-cap',
      state,
      label: 'Spell suppression cap',
      before: `${value(before.chance)}% / ${value(before.cap)}% cap`,
      after: `${value(after.chance)}% / ${value(after.cap)}% cap`,
      detail: state === 'broken'
        ? `The candidate drops PoB's capped spell suppression chance below the pinned PoB suppression cap.`
        : `The candidate restores PoB's spell suppression chance to the pinned PoB suppression cap.`,
    };
  }
  if (!beforeSatisfied || !finite(before.overCap) || !finite(after.overCap) || Math.abs(after.overCap - before.overCap) <= 1e-9) return undefined;
  const state: PobConstraintFindingState = after.overCap < before.overCap ? 'weakened-buffer' : 'improved-buffer';
  return {
    key: 'spell-suppression-cap',
    kind: 'spell-suppression-cap',
    state,
    label: 'Spell suppression buffer',
    before: `${value(before.chance)}% (+${value(before.overCap)} over)`,
    after: `${value(after.chance)}% (+${value(after.overCap)} over)`,
    detail: state === 'weakened-buffer'
      ? 'The candidate keeps spell suppression capped in PoB but reduces suppression overcap.'
      : 'The candidate increases spell suppression overcap in PoB.',
  };
}

export function constraintFindings(comparison: PobConstraintComparison): PobConstraintFinding[] {
  const findings: Array<PobConstraintFinding | undefined> = [
    requirementFinding('strength-requirement', 'Strength', comparison.before.attributes.strength, comparison.after.attributes.strength),
    requirementFinding('dexterity-requirement', 'Dexterity', comparison.before.attributes.dexterity, comparison.after.attributes.dexterity),
    requirementFinding('intelligence-requirement', 'Intelligence', comparison.before.attributes.intelligence, comparison.after.attributes.intelligence),
    resistanceFinding('fire-resistance-cap', 'Fire resistance', comparison.before.resistances.fire, comparison.after.resistances.fire),
    resistanceFinding('cold-resistance-cap', 'Cold resistance', comparison.before.resistances.cold, comparison.after.resistances.cold),
    resistanceFinding('lightning-resistance-cap', 'Lightning resistance', comparison.before.resistances.lightning, comparison.after.resistances.lightning),
    resistanceFinding('chaos-resistance-cap', 'Chaos resistance', comparison.before.resistances.chaos, comparison.after.resistances.chaos),
    suppressionFinding(comparison.before.spellSuppression, comparison.after.spellSuppression),
  ];
  const rank: Record<PobConstraintFindingState, number> = { broken: 0, repaired: 1, 'weakened-buffer': 2, 'improved-buffer': 3 };
  return findings.filter((finding): finding is PobConstraintFinding => Boolean(finding))
    .sort((left, right) => rank[left.state] - rank[right.state] || left.label.localeCompare(right.label));
}

function baselineRequirementFinding(key: string, label: string, metric: { current?: number; required?: number }): PobBaselineConstraintFinding | undefined {
  if (!finite(metric.current) || !finite(metric.required) || metric.current >= metric.required) return undefined;
  return {
    key,
    kind: 'attribute-requirement',
    severity: 'warning',
    label: `${label} requirement not met`,
    value: `${value(metric.current)} / ${value(metric.required)} required`,
    detail: `Pinned PoB reports less ${label.toLowerCase()} than the imported build currently requires. This is a proven requirement failure in the calculated state.`,
  };
}

function baselineElementalFinding(key: string, label: string, metric: { missing?: number; overCap?: number }): PobBaselineConstraintFinding | undefined {
  if (!finite(metric.missing) || metric.missing <= 1e-9) return undefined;
  return {
    key,
    kind: 'elemental-resistance-cap',
    severity: 'warning',
    label: `${label} below PoB cap`,
    value: `${value(metric.missing)} missing`,
    detail: `Pinned PoB reports the imported build is ${value(metric.missing)} percentage point${Math.abs(metric.missing - 1) <= 1e-9 ? '' : 's'} below its calculated ${label.toLowerCase()} cap.`,
  };
}

export function baselineConstraintFindings(metrics: PobConstraintMetrics): PobBaselineConstraintFinding[] {
  const findings: Array<PobBaselineConstraintFinding | undefined> = [
    baselineRequirementFinding('baseline-strength-requirement', 'Strength', metrics.attributes.strength),
    baselineRequirementFinding('baseline-dexterity-requirement', 'Dexterity', metrics.attributes.dexterity),
    baselineRequirementFinding('baseline-intelligence-requirement', 'Intelligence', metrics.attributes.intelligence),
    baselineElementalFinding('baseline-fire-resistance', 'Fire resistance', metrics.resistances.fire),
    baselineElementalFinding('baseline-cold-resistance', 'Cold resistance', metrics.resistances.cold),
    baselineElementalFinding('baseline-lightning-resistance', 'Lightning resistance', metrics.resistances.lightning),
  ];

  const chaos = metrics.resistances.chaos;
  if (finite(chaos.missing) && chaos.missing > 1e-9) {
    findings.push({
      key: 'baseline-chaos-resistance',
      kind: 'chaos-resistance-posture',
      severity: 'info',
      label: 'Chaos resistance below PoB cap',
      value: `${value(chaos.missing)} missing`,
      detail: 'Pinned PoB reports uncapped chaos resistance. This is defensive posture evidence, not a universal build-validity failure.',
    });
  }

  const suppression = metrics.spellSuppression;
  if (finite(suppression.chance) && finite(suppression.cap) && suppression.chance > 0 && suppression.chance < suppression.cap) {
    findings.push({
      key: 'baseline-spell-suppression',
      kind: 'spell-suppression-posture',
      severity: 'info',
      label: 'Spell suppression is not capped',
      value: `${value(suppression.chance)}% / ${value(suppression.cap)}% cap`,
      detail: 'Pinned PoB reports partial spell suppression. ExileQuesting does not assume every build intends to cap suppression, so this remains posture evidence rather than a validity failure.',
    });
  }

  const rank: Record<PobBaselineConstraintFindingSeverity, number> = { warning: 0, info: 1 };
  return findings.filter((finding): finding is PobBaselineConstraintFinding => Boolean(finding))
    .sort((left, right) => rank[left.severity] - rank[right.severity] || left.label.localeCompare(right.label));
}
