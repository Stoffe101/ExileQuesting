import { describe, expect, it } from 'vitest';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_WORKER_SENTINEL,
  parsePobWorkerProtocolLines,
  validPobCalculationRequest,
  type PobWorkerFlaskInspectionSuccess,
} from './pob-calculation';

describe('PoB flask profile inspection protocol', () => {
  it('accepts a bounded flask inspection request without perturbations', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'inspect-flasks',
      operation: 'inspect-flasks',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'imported' },
    })).toBe(true);
  });

  it('keeps the same XML, scenario and request-id bounds as calculation requests', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: '',
      operation: 'inspect-flasks',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'imported' },
    })).toBe(false);

    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'bad-scenario',
      operation: 'inspect-flasks',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'not-a-scenario' as never },
    })).toBe(false);

    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'empty-xml',
      operation: 'inspect-flasks',
      xml: '   ',
      scenario: { scenario: 'imported' },
    })).toBe(false);
  });

  it('preserves processed PoB flaskData and build modifier inputs from worker IPC', () => {
    const payload: PobWorkerFlaskInspectionSuccess = {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'profile',
      ok: true,
      flaskInspection: {
        protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
        requestId: 'profile',
        kernel: {
          protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
          pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
          pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
          runtime: 'LuaJIT',
          runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
          adapterVersion: '0.5.0',
        },
        scenario: { scenario: 'sustained-boss' },
        emptyFlaskSlots: 2,
        flasks: [{
          slot: 'Flask 3',
          name: 'Granite Flask',
          baseName: 'Granite Flask',
          rarity: 'MAGIC',
          active: true,
          life: false,
          mana: false,
          utility: true,
          local: {
            duration: 6.4,
            chargesMax: 60,
            chargesUsed: 30,
            chargeGainModifier: 1.2,
            effectIncrease: 25,
          },
          buildModifiers: {
            durationIncrease: 20,
            chargesUsedIncrease: -10,
            chargesGainedIncrease: 15,
            effectIncrease: 30,
            magicUtilityEffectIncrease: 10,
            genericChargesGeneratedPerSecond: 3,
            lifeChargesGeneratedPerSecond: 0,
            manaChargesGeneratedPerSecond: 0,
            utilityChargesGeneratedPerSecond: 2,
            chargesGeneratedPerEmptyFlaskPerSecond: 1,
            chanceNotConsumeCharges: 20,
            ironFlaskChargesGeneratedOnWardBreak: 0,
          },
        }],
        elapsedMs: 4,
      },
    };

    const parsed = parsePobWorkerProtocolLines(`${POB_WORKER_SENTINEL}${JSON.stringify(payload)}`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      ok: true,
      flaskInspection: {
        emptyFlaskSlots: 2,
        flasks: [{
          slot: 'Flask 3',
          active: true,
          local: { duration: 6.4, chargesUsed: 30 },
          buildModifiers: {
            utilityChargesGeneratedPerSecond: 2,
            chanceNotConsumeCharges: 20,
          },
        }],
      },
    });
  });

  it('does not expose a derived uptime percentage in the deterministic profile contract', () => {
    const profileShape = {
      slot: 'Flask 1',
      local: {
        duration: 5,
        chargesMax: 40,
        chargesUsed: 20,
        chargeGainModifier: 1,
      },
      buildModifiers: {
        genericChargesGeneratedPerSecond: 4,
        chanceNotConsumeCharges: 0,
      },
    };

    expect(Object.keys(profileShape)).not.toContain('uptime');
    expect(JSON.stringify(profileShape)).not.toMatch(/uptimePercent|averageUptime|minimumUptime/);
  });
});
