import { describe, expect, it } from 'vitest';
import type { PassiveTreeSnapshot } from './passive-data';
import {
  canonicalMaxrollGuideUrl,
  isMaxrollGuideUrl,
  maxrollPlannerIdFromHtml,
  normalizeMaxrollMetadata,
  parseMaxrollGuide,
} from './maxroll';

function remix(loaderData: Record<string, unknown>): string {
  return `<html><head><title>fixture</title></head><body><script>window.__remixContext = ${JSON.stringify({ state: { loaderData } })};</script></body></html>`;
}

function guideHtml(options: { title: string; slug: string; plannerId?: string; legacy?: string; modified?: string }): string {
  const post = {
    title: options.title,
    slug: options.slug,
    modified: options.modified ?? '2026-09-02',
    gutenbergBlock: options.legacy ? [{ blockName: 'core/embed', attributes: { url: options.legacy } }] : [],
  };
  const plannerLink = options.plannerId ? `<a href="/poe/planner/${options.plannerId}">planner</a>` : '';
  return remix({ 'branch-posts': { post } }).replace('</body>', `${plannerLink}</body>`);
}

function plannerHtml(profile: Record<string, unknown>, data: Record<string, unknown>): string {
  return remix({ 'poe-planner-by-id': { profile: { ...profile, data: JSON.stringify(data) } } });
}

function passives(ids: number[], gameVersion = '3.29'): PassiveTreeSnapshot {
  return {
    schemaVersion: 1,
    gameVersion,
    generatedAt: '2026-09-02T00:00:00.000Z',
    source: { url: 'https://www.pathofexile.com/passive-skill-tree', sha256: 'fixture' },
    nodes: ids.map((id, index) => ({ id, name: ['Ballistics', 'Precise Technique', 'Quickstep', 'Finesse'][index] ?? `Node ${id}`, kind: index === 1 ? 'keystone' : index === 0 ? 'notable' : 'normal' })),
  };
}

describe('Maxroll leveling guide adapter', () => {
  it('accepts only public PoE Maxroll build-guide URLs and canonicalizes them', () => {
    expect(isMaxrollGuideUrl('https://maxroll.gg/poe/build-guides/explosive-concoction-deadeye-leveling-build-guide')).toBe(true);
    expect(isMaxrollGuideUrl('https://www.maxroll.gg/poe/build-guides/leveling-twink-ranger/')).toBe(true);
    expect(isMaxrollGuideUrl('http://maxroll.gg/poe/build-guides/leveling-twink-ranger')).toBe(false);
    expect(isMaxrollGuideUrl('https://maxroll.gg/poe/planner/gep906sn')).toBe(false);
    expect(isMaxrollGuideUrl('https://example.com/poe/build-guides/leveling-twink-ranger')).toBe(false);
    expect(canonicalMaxrollGuideUrl('https://www.maxroll.gg/poe/build-guides/leveling-twink-ranger/')).toBe('https://maxroll.gg/poe/build-guides/leveling-twink-ranger');
  });

  it('parses normal checkpoint add/refund history and current skill stages', () => {
    const guide = guideHtml({
      title: 'Explosive Concoction Deadeye Leveling Build Guide',
      slug: 'explosive-concoction-deadeye-leveling-build-guide',
      plannerId: 'zh1t10s5',
    });
    const planner = plannerHtml({ id: 'zh1t10s5', class: 'Dex', name: 'Fixture', type: 'embed' }, {
      activeEmbed: 2,
      items: {},
      embeds: [
        {
          type: 'skills', id: 1, name: 'Skills 1', step: 0,
          steps: [
            { name: 'Level 1 - 12', skills: [{ gems: [{ name: 'Burning Arrow' }, { name: 'Pierce Support' }] }] },
            { name: 'Level 12 - 16', skills: [{ gems: [{ name: 'Explosive Concoction' }, { name: 'Volley Support' }] }] },
          ],
        },
        {
          type: 'passives', id: 2, name: 'Passive Tree 1', version: 325, charClass: 'Dex', ascendancy: 'Deadeye', active: 1,
          variants: [{ name: 'Variant 1', history: [{ add: [10, 20] }, { remove: [10], add: [30] }], masteries: {} }],
        },
      ],
    });
    const parsed = parseMaxrollGuide(
      'https://maxroll.gg/poe/build-guides/explosive-concoction-deadeye-leveling-build-guide',
      guide,
      planner,
      passives([10, 20, 30]),
    );

    expect(parsed.metadata.mode).toBe('league-start');
    expect(parsed.metadata.plannerId).toBe('zh1t10s5');
    expect(parsed.metadata.plannerTreeVersion).toBe('3.25');
    expect(parsed.metadata.compatibility).toBe('compatible-ids');
    expect(parsed.metadata.passiveOperations).toEqual([
      { type: 'allocate', nodeId: 10, checkpoint: 1 },
      { type: 'allocate', nodeId: 20, checkpoint: 1 },
      { type: 'refund', nodeId: 10, checkpoint: 2 },
      { type: 'allocate', nodeId: 30, checkpoint: 2 },
    ]);
    expect(parsed.build.className).toBe('Ranger');
    expect(parsed.build.ascendancy).toBe('Deadeye');
    expect(parsed.build.treeStages).toEqual([]);
    expect(parsed.build.skillStages.map((stage) => stage.title)).toEqual(['Level 1 - 12', 'Level 12 - 16']);
    expect(parsed.build.skillStages[1].skillGroups?.[0].gems.map((gem) => gem.name)).toEqual(['Explosive Concoction', 'Volley Support']);
  });

  it('discovers a Twink legacy embed and normalizes scalar passive history one node at a time', () => {
    const guide = guideHtml({
      title: 'Leveling Twink Ranger',
      slug: 'leveling-twink-ranger',
      legacy: 'https://backend.maxroll.net/poe/poe-planner/gep906sn#12&amp;leveling',
    });
    expect(maxrollPlannerIdFromHtml(guide)).toBe('gep906sn');
    const planner = plannerHtml({ id: 'gep906sn', class: 'Dex', name: 'Twink Leveling', type: 'embed' }, {
      activeEmbed: 13,
      items: { '1': { name: 'One With Nothing' }, '2': { name: 'Tabula Rasa' } },
      embeds: [
        { type: 'equipment', id: 1, name: 'act 1', items: { body: '2' } },
        {
          type: 'skills', id: 2, name: 'Skills 1', step: 0,
          steps: [
            { name: 'Level 2', skills: [{ item: 'weapon', gems: [{ name: 'Smite' }] }] },
            { name: 'Hollow Palm Swap (Level 12)', skills: [{ item: 'body', gems: [{ name: 'Consecrated Path' }, { name: 'Added Fire Damage Support' }] }] },
          ],
        },
        { type: 'passives', id: 3, name: 'ranger', version: 325, charClass: 'Dex', active: 0, variants: [{ name: 'Variant 1', history: [10, 20, 30], masteries: {} }] },
        { type: 'passives', id: 6, name: 'duelist', version: 325, charClass: 'StrDex', active: 0, variants: [{ name: 'Variant 1', history: [999], masteries: {} }] },
      ],
    });
    const parsed = parseMaxrollGuide(
      'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
      guide,
      planner,
      passives([10, 20, 30]),
    );

    expect(parsed.metadata.mode).toBe('twink');
    expect(parsed.metadata.plannerId).toBe('gep906sn');
    expect(parsed.metadata.passiveOperations).toEqual([
      { type: 'allocate', nodeId: 10, checkpoint: 1 },
      { type: 'allocate', nodeId: 20, checkpoint: 2 },
      { type: 'allocate', nodeId: 30, checkpoint: 3 },
    ]);
    expect(parsed.metadata.skillMilestones).toEqual(['Level 2', 'Hollow Palm Swap (Level 12)']);
    expect(parsed.metadata.equipmentMilestones[0]).toMatchObject({ name: 'act 1', itemNames: ['Tabula Rasa'] });
  });

  it('disables exact coaching when a referenced passive no longer exists', () => {
    const guide = guideHtml({ title: 'Some Ranger Leveling Guide', slug: 'some-ranger-leveling-guide', plannerId: 'abc123' });
    const planner = plannerHtml({ id: 'abc123', class: 'Dex', type: 'embed' }, {
      embeds: [{ type: 'passives', id: 1, version: 329, charClass: 'Dex', active: 1, variants: [{ history: [10, 999], masteries: {} }] }],
    });
    const parsed = parseMaxrollGuide('https://maxroll.gg/poe/build-guides/some-ranger-leveling-guide', guide, planner, passives([10]));
    expect(parsed.metadata.compatibility).toBe('stale');
    expect(parsed.metadata.compatibilityMessage).toContain('1 Maxroll passive node ID');
  });

  it('restores bounded Maxroll provenance and passive cursor data safely', () => {
    const normalized = normalizeMaxrollMetadata({
      guideUrl: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
      guideTitle: 'Leveling Twink Ranger',
      guideSlug: 'leveling-twink-ranger',
      mode: 'twink',
      compatibility: 'compatible-ids',
      compatibilityMessage: 'fixture',
      passiveOperations: [{ type: 'allocate', nodeId: 10, checkpoint: 1 }, { type: 'destroy', nodeId: 20, checkpoint: 2 }],
      skillMilestones: ['Level 2', 'Level 2', 'Level 12'],
      equipmentMilestones: [{ id: '1', name: 'act 1', itemNames: ['Tabula Rasa', 'Tabula Rasa'] }],
    });
    expect(normalized?.mode).toBe('twink');
    expect(normalized?.passiveOperations).toEqual([{ type: 'allocate', nodeId: 10, checkpoint: 1 }]);
    expect(normalized?.skillMilestones).toEqual(['Level 2', 'Level 12']);
    expect(normalized?.equipmentMilestones[0].itemNames).toEqual(['Tabula Rasa']);
  });
});
