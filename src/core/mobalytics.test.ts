import { describe, expect, it } from 'vitest';
import {
  canonicalMobalyticsBuildUrl,
  extractMobalyticsPreloadedState,
  findMobalyticsPoe1Document,
  isMobalyticsBuildUrl,
  mobalyticsPobCodeFromHtml,
  parseMobalyticsEmbeddedBuild,
} from './mobalytics';

const PROFILE_URL = 'https://mobalytics.gg/poe/profile/test-user/builds/test-leveling-build';

function fixtureHtml(): string {
  const state = {
    unrelated: { text: 'a string with } braces and \\"escaped quotes\\" inside' },
    userGeneratedDocumentBySlug: {
      data: {
        data: {
          pobCode: 'eNqFakeUrlSafePobCode_1234567890',
          buildVariants: {
            values: [
              {
                id: 'lvl-10',
                title: 'Lvl 10 Magma',
                level: 10,
                passiveTree: {
                  mainTree: { selectedSlugs: ['node-100', 'node-200', 'not-a-node'] },
                  ascendancyTree: { selectedSlugs: [] },
                },
                skills: {
                  gemGroups: [{
                    label: 'Main skill',
                    slotSlug: 'body',
                    gems: [
                      { skillGemObject: { data: { name: 'Rolling Magma' } } },
                      { skillGemObject: { data: { name: 'Combustion Support' } } },
                    ],
                  }],
                },
                genericBuilder: {
                  slots: [
                    { gameSlotSlug: 'boots', gameEntity: { title: 'Wool Shoes', data: { name: 'New Item', rarity: 'RARE' } } },
                    { gameSlotSlug: 'helmet', gameEntity: { title: 'Goldrim', data: { name: 'Goldrim', subTitle: 'Leather Cap', rarity: 'UNIQUE' } } },
                  ],
                },
              },
              {
                id: 22,
                name: 'Lvl 22 Oversoul',
                characterLevel: '22',
                passiveTree: {
                  mainTree: { selectedSlugs: ['node-100', 'node-300'] },
                  ascendancyTree: { selectedSlugs: ['node-400'] },
                  alternateAscendancyTree: { selectedSlugs: ['node-500'] },
                },
                skills: { gemGroups: [] },
                genericBuilder: { slots: [] },
              },
            ],
          },
        },
      },
    },
  };
  return `<html><script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script></html>`;
}

describe('Mobalytics build URL validation', () => {
  it('accepts current public PoE1 build URL families and canonicalizes host/trailing slash', () => {
    expect(isMobalyticsBuildUrl(PROFILE_URL)).toBe(true);
    expect(isMobalyticsBuildUrl('https://www.mobalytics.gg/poe/builds/test-build/')).toBe(true);
    expect(canonicalMobalyticsBuildUrl('https://www.mobalytics.gg/poe/builds/test-build/')).toBe('https://mobalytics.gg/poe/builds/test-build');
  });

  it('rejects credentials, alternate hosts, query/hash smuggling and non-build routes', () => {
    expect(isMobalyticsBuildUrl('https://evil.example/poe/builds/test-build')).toBe(false);
    expect(isMobalyticsBuildUrl('https://mobalytics.gg.evil.example/poe/builds/test-build')).toBe(false);
    expect(isMobalyticsBuildUrl('https://user:pass@mobalytics.gg/poe/builds/test-build')).toBe(false);
    expect(isMobalyticsBuildUrl('https://mobalytics.gg/poe/builds/test-build?next=https://evil.example')).toBe(false);
    expect(isMobalyticsBuildUrl('https://mobalytics.gg/poe/starter-builds')).toBe(false);
  });
});

describe('Mobalytics embedded PoE1 parsing', () => {
  it('extracts preloaded state without evaluating script and finds nested build data', () => {
    const state = extractMobalyticsPreloadedState(fixtureHtml());
    expect(state).toBeTruthy();
    const document = findMobalyticsPoe1Document(state);
    expect(document?.pobCode).toBe('eNqFakeUrlSafePobCode_1234567890');
  });

  it('prefers the complete embedded PoB code and normalizes useful variant facts', () => {
    const parsed = parseMobalyticsEmbeddedBuild(PROFILE_URL, fixtureHtml());
    expect(parsed.pobCode).toBe('eNqFakeUrlSafePobCode_1234567890');
    expect(parsed.variants).toHaveLength(2);
    expect(parsed.variants[0]).toEqual({
      id: 'lvl-10',
      title: 'Lvl 10 Magma',
      level: 10,
      passiveNodeIds: [100, 200],
      skillGroups: [{ label: 'Main skill', slot: 'body', gems: ['Rolling Magma', 'Combustion Support'] }],
      equipment: [
        { slot: 'boots', name: undefined, baseType: 'Wool Shoes', rarity: 'RARE' },
        { slot: 'helmet', name: 'Goldrim', baseType: 'Leather Cap', rarity: 'UNIQUE' },
      ],
    });
    expect(parsed.variants[1]).toMatchObject({
      id: '22',
      title: 'Lvl 22 Oversoul',
      level: 22,
      passiveNodeIds: [100, 300, 400, 500],
    });
    expect(mobalyticsPobCodeFromHtml(PROFILE_URL, fixtureHtml())).toBe(parsed.pobCode);
  });

  it('fails closed when the expected state or build document is missing', () => {
    expect(extractMobalyticsPreloadedState('<html></html>')).toBeUndefined();
    expect(() => parseMobalyticsEmbeddedBuild(PROFILE_URL, '<script>window.__PRELOADED_STATE__ = {"foo":1};</script>')).toThrow(/recognizable PoE1 build document/);
  });
});
