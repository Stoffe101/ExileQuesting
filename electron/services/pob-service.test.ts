import { describe, expect, it } from 'vitest';
import { importPobBuild, MOBALYTICS_POB_BRIDGE_MESSAGE } from './pob-service';

describe('Mobalytics PoB bridge', () => {
  it('recognizes a Mobalytics build before generic PoB parsing and gives actionable guidance', async () => {
    await expect(importPobBuild(
      'https://mobalytics.gg/poe/profile/test-user/builds/test-leveling-build',
      '0.2.2',
    )).rejects.toThrow(MOBALYTICS_POB_BRIDGE_MESSAGE);
  });
});
