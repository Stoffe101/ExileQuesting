import { afterEach, describe, expect, it } from 'vitest';
import { discardPendingPobCalculationPayload } from './pob-calculation-payload';
import { importPobBuild, MOBALYTICS_POB_BRIDGE_MESSAGE } from './pob-service';

const pendingIds: string[] = [];

afterEach(() => {
  for (const id of pendingIds.splice(0)) discardPendingPobCalculationPayload(id);
});

describe('PoB import service', () => {
  it('recognizes a Mobalytics build before generic PoB parsing and gives actionable guidance', async () => {
    await expect(importPobBuild(
      'https://mobalytics.gg/poe/profile/test-user/builds/test-leveling-build',
      '0.2.2',
    )).rejects.toThrow(MOBALYTICS_POB_BRIDGE_MESSAGE);
  });

  it('attaches bounded SHA-256 provenance for the canonical XML used by Build Doctor', async () => {
    const imported = await importPobBuild(
      '<PathOfBuilding><Build level="12" className="Witch" ascendClassName="" mainSocketGroup="1"/></PathOfBuilding>',
      '0.3.0',
    );
    pendingIds.push(imported.id);
    expect(imported.calculation).toMatchObject({ schemaVersion: 1, kind: 'pob-xml' });
    expect(imported.calculation.bytes).toBeGreaterThan(20);
    expect(imported.calculation.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
