import { describe, expect, it } from 'vitest';
import type { PobConstraintMetrics } from './pob-calculation';
import {
  baselineConstraintFindings,
  constraintFindings,
  parsePobConstraintProtocolLines,
  POB_CONSTRAINT_PROTOCOL_VERSION,
  POB_CONSTRAINT_WORKER_SENTINEL,
  validPobConstraintRequest,
  type PobConstraintComparison,
} from './pob-constraints';

function metrics(): PobConstraintMetrics {
  return {
    attributes: {
      strength: { current: 180, required: 155 },
      dexterity: { current: 160, required: 150 },
      intelligence: { current: 220, required: 200 },
    },
    reservation: { manaUnreserved: 120, manaUnreservedPercent: 10, lifeUnreserved: 4_000, lifeUnreservedPercent: 100 },
    spellSuppression: { chance: 100, effectiveChance: 100, overCap: 12, cap: 100 },
    resistances: {
      fire: { current: 75, total: 105, overCap: 30, missing: 0 },
      cold: { current: 75, total: 100, overCap: 25, missing: 0 },
      lightning: { current: 75, total: 95, overCap: 20, missing: 0 },
      chaos: { current: 75, total: 80, overCap: 5, missing: 0 },
    },
  };
}

function comparison(before = metrics(), after = metrics()): PobConstraintComparison {
  return { slot: 'Boots', before, after };
}

describe('PoB constraint protocol', () => {
  it('accepts bounded health, baseline inspection and item-constraint requests only', () => {
    expect(validPobConstraintRequest({ protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION, requestId: 'health', operation: 'health' })).toBe(true);
    expect(validPobConstraintRequest({
      protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
      requestId: 'baseline',
      operation: 'inspect-build-constraints',
      xml: '<PathOfBuilding/>',
    })).toBe(true);
    expect(validPobConstraintRequest({
      protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
      requestId: 'candidate',
      operation: 'compare-item-constraints',
      xml: '<PathOfBuilding/>',
      slot: 'Boots',
      itemText: 'Rarity: Rare\nBoots',
    })).toBe(true);
    expect(validPobConstraintRequest({
      protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
      requestId: '',
      operation: 'compare-item-constraints',
      xml: '<PathOfBuilding/>',
      slot: 'Boots',
      itemText: 'x',
    })).toBe(false);
    expect(validPobConstraintRequest({
      protocolVersion: POB_CONSTRAINT_PROTOCOL_VERSION,
      requestId: 'baseline',
      operation: 'inspect-build-constraints',
      xml: '',
    })).toBe(false);
  });

  it('ignores ordinary PoB stdout and parses only the dedicated sentinel', () => {
    const response = { protocolVersion: 1, requestId: 'x', ok: false, error: { code: 'test', message: 'nope', retryable: false } };
    const parsed = parsePobConstraintProtocolLines(`PoB chatter\n${POB_CONSTRAINT_WORKER_SENTINEL}${JSON.stringify(response)}\nmore chatter`);
    expect(parsed).toEqual([response]);
  });
});

describe('PoB hard-constraint findings', () => {
  it('detects an attribute requirement changing from satisfied to unsatisfied', () => {
    const after = metrics();
    after.attributes.strength = { current: 140, required: 155 };
    expect(constraintFindings(comparison(metrics(), after))).toContainEqual(expect.objectContaining({
      key: 'strength-requirement', kind: 'attribute-requirement', state: 'broken',
    }));
  });

  it('detects a previously unsatisfied attribute requirement being repaired', () => {
    const before = metrics();
    before.attributes.dexterity = { current: 140, required: 150 };
    expect(constraintFindings(comparison(before, metrics()))).toContainEqual(expect.objectContaining({
      key: 'dexterity-requirement', state: 'repaired',
    }));
  });

  it('uses PoB missing-resistance evidence instead of assuming a resistance cap', () => {
    const after = metrics();
    after.resistances.fire = { current: 68, total: 68, overCap: 0, missing: 7 };
    const finding = constraintFindings(comparison(metrics(), after)).find((entry) => entry.key === 'fire-resistance-cap');
    expect(finding).toMatchObject({ state: 'broken', kind: 'resistance-cap' });
    expect(finding?.after).toBe('7 missing');
    expect(finding?.detail).toMatch(/PoB report missing/i);
  });

  it('separates a weaker resistance buffer from an actually broken cap', () => {
    const after = metrics();
    after.resistances.cold = { current: 75, total: 82, overCap: 7, missing: 0 };
    expect(constraintFindings(comparison(metrics(), after))).toContainEqual(expect.objectContaining({
      key: 'cold-resistance-cap', state: 'weakened-buffer',
    }));
  });

  it('detects suppression cap loss using the cap supplied by pinned PoB', () => {
    const after = metrics();
    after.spellSuppression = { chance: 92, effectiveChance: 92, overCap: 0, cap: 100 };
    expect(constraintFindings(comparison(metrics(), after))).toContainEqual(expect.objectContaining({
      key: 'spell-suppression-cap', state: 'broken', kind: 'spell-suppression-cap',
    }));
  });

  it('does not diagnose suppression when the before/after cap provenance disagrees', () => {
    const after = metrics();
    after.spellSuppression = { chance: 95, effectiveChance: 95, overCap: 0, cap: 95 };
    expect(constraintFindings(comparison(metrics(), after)).some((entry) => entry.key === 'spell-suppression-cap')).toBe(false);
  });

  it('does not invent reservation validity from unreserved pool values alone', () => {
    const after = metrics();
    after.reservation = { manaUnreserved: 1, manaUnreservedPercent: 0.1, lifeUnreserved: 4_000, lifeUnreservedPercent: 100 };
    expect(constraintFindings(comparison(metrics(), after))).toEqual([]);
  });

  it('orders broken findings ahead of repairs and buffer changes', () => {
    const before = metrics();
    before.attributes.dexterity = { current: 140, required: 150 };
    const after = metrics();
    after.attributes.strength = { current: 140, required: 155 };
    after.resistances.fire = { current: 75, total: 80, overCap: 5, missing: 0 };
    const findings = constraintFindings(comparison(before, after));
    expect(findings.map((entry) => entry.state)).toEqual(['broken', 'repaired', 'weakened-buffer']);
  });
});

describe('PoB baseline integrity findings', () => {
  it('treats unmet attributes as proven requirement failures', () => {
    const current = metrics();
    current.attributes.strength = { current: 145, required: 155 };
    expect(baselineConstraintFindings(current)).toContainEqual(expect.objectContaining({
      key: 'baseline-strength-requirement', severity: 'warning', kind: 'attribute-requirement', value: '145 / 155 required',
    }));
  });

  it('treats missing elemental resistance as a deterministic defensive gap', () => {
    const current = metrics();
    current.resistances.fire = { current: 68, total: 68, overCap: 0, missing: 7 };
    expect(baselineConstraintFindings(current)).toContainEqual(expect.objectContaining({
      key: 'baseline-fire-resistance', severity: 'warning', kind: 'elemental-resistance-cap', value: '7 missing',
    }));
  });

  it('keeps uncapped chaos resistance and partial suppression as posture evidence rather than universal validity failures', () => {
    const current = metrics();
    current.resistances.chaos = { current: 20, total: 20, overCap: 0, missing: 55 };
    current.spellSuppression = { chance: 82, effectiveChance: 82, overCap: 0, cap: 100 };
    const findings = baselineConstraintFindings(current);
    expect(findings).toContainEqual(expect.objectContaining({ key: 'baseline-chaos-resistance', severity: 'info' }));
    expect(findings).toContainEqual(expect.objectContaining({ key: 'baseline-spell-suppression', severity: 'info' }));
    expect(findings.filter((entry) => entry.severity === 'warning')).toHaveLength(0);
  });

  it('does not invent reservation validity or suppression intent', () => {
    const current = metrics();
    current.reservation = { manaUnreserved: 1, manaUnreservedPercent: 0.1, lifeUnreserved: 4_000, lifeUnreservedPercent: 100 };
    current.spellSuppression = { chance: 0, effectiveChance: 0, overCap: 0, cap: 100 };
    expect(baselineConstraintFindings(current)).toEqual([]);
  });
});
