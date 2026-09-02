import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePobExportCode, describePobInput, parsePobInput, parsePobXml } from './pob';

// Deliberately mirrors modern PoB semantics: passive <Spec> entries do not have IDs.
// Tree.activeSpec is a 1-based ordinal, while SkillSet/ItemSet/ConfigSet use their own IDs.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="38" className="Witch" ascendClassName="Elementalist" targetVersion="3_29" mainSocketGroup="1" />
  <Tree activeSpec="2">
    <Spec title="Level 12" treeVersion="3_29" classId="3" ascendClassId="0" secondaryAscendClassId="0" nodes="1,2" masteryEffects="{2,101}" />
    <Spec title="Level 38" treeVersion="3_29" classId="3" ascendClassId="1" secondaryAscendClassId="0" nodes="1,2,3" masteryEffects="{2,101},{3,202}" />
  </Tree>
  <Skills activeSkillSet="22">
    <SkillSet id="11" title="Level 12"><Skill label="Main"><Gem nameSpec="Rolling Magma" level="10" enabled="true" /></Skill></SkillSet>
    <SkillSet id="22" title="Level 38"><Skill label="Main"><Gem nameSpec="Armageddon Brand" skillId="ArmageddonBrand" level="1" enabled="true"/><Gem nameSpec="Combustion" level="1" enabled="true"/></Skill></SkillSet>
  </Skills>
  <Items activeItemSet="202"><ItemSet id="101" title="Level 12"/><ItemSet id="202" title="Level 38"/></Items>
  <Config activeConfigSet="8"><ConfigSet id="7" title="Level 12"/><ConfigSet id="8" title="Level 38"/></Config>
  <Notes><![CDATA[Switch at level 28 & keep moving.]]></Notes>
</PathOfBuilding>`;

function exportCode(value: string): string {
  return deflateSync(Buffer.from(value, 'utf8')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('PoB foundation', () => {
  it('recognizes XML, export codes and strict pobb.in URLs', () => {
    expect(describePobInput(xml).kind).toBe('xml');
    expect(describePobInput(exportCode(xml)).kind).toBe('export-code');
    expect(describePobInput('https://pobb.in/AbC_123').pobbinRawUrl).toBe('https://pobb.in/AbC_123/raw');
    expect(() => describePobInput('https://evil.example/pobb.in/abc')).toThrow();
  });

  it('decodes the official URL-safe Base64 + zlib PoB envelope', async () => {
    expect(await decodePobExportCode(exportCode(xml))).toContain('<PathOfBuilding>');
  });

  it('parses modern passive specs by ordinal without inventing PoB IDs', () => {
    const build = parsePobXml(xml);
    expect(build.targetVersion).toBe('3_29');
    expect(build.treeStages).toHaveLength(2);
    expect(build.treeStages.map((stage) => stage.id)).toEqual(['tree:1', 'tree:2']);
    expect(build.treeStages.map((stage) => stage.sourceId)).toEqual([undefined, undefined]);
    expect(build.treeStages.map((stage) => stage.treeVersion)).toEqual(['3_29', '3_29']);
    expect(build.treeStages[0].active).toBe(false);
    expect(build.treeStages[1].active).toBe(true);
    expect(build.treeStages[1].classId).toBe(3);
    expect(build.treeStages[1].ascendClassId).toBe(1);
    expect(build.treeStages[1].nodeIds).toEqual([1, 2, 3]);
    expect(build.treeStages[1].masterySelections).toEqual([{ nodeId: 2, effectId: 101 }, { nodeId: 3, effectId: 202 }]);
  });

  it('keeps each PoB set family independent and parses configuration sets', () => {
    const build = parsePobXml(xml);
    expect(build.className).toBe('Witch');
    expect(build.ascendancy).toBe('Elementalist');
    expect(build.level).toBe(38);
    expect(build.treeStages.map((stage) => stage.title)).toEqual(['Level 12', 'Level 38']);
    expect(build.skillStages.map((stage) => stage.sourceId)).toEqual(['11', '22']);
    expect(build.itemStages.map((stage) => stage.sourceId)).toEqual(['101', '202']);
    expect(build.configStages.map((stage) => stage.sourceId)).toEqual(['7', '8']);
    expect(build.skillStages[1].active).toBe(true);
    expect(build.itemStages[1].active).toBe(true);
    expect(build.configStages[1].active).toBe(true);
    expect(build.skillStages[0].skillGroups?.[0].gems.map((gem) => gem.name)).toEqual(['Rolling Magma']);
    expect(build.skillStages[1].skillGroups?.[0].gems.map((gem) => gem.name)).toEqual(['Armageddon Brand', 'Combustion']);
    expect(build.activeSkillGroups[0].gems.map((gem) => gem.name)).toEqual(['Armageddon Brand', 'Combustion']);
    expect(build.notes).toContain('Switch at level 28');
  });

  it('does not confuse same-version passive trees with the active ordinal', () => {
    const sameVersion = `<PathOfBuilding><Build targetVersion="3_29"/><Tree activeSpec="3"><Spec title="12" treeVersion="3_29"/><Spec title="28" treeVersion="3_29"/><Spec title="Maps" treeVersion="3_29"/></Tree></PathOfBuilding>`;
    const stages = parsePobXml(sameVersion).treeStages;
    expect(new Set(stages.map((stage) => stage.id)).size).toBe(3);
    expect(stages.map((stage) => stage.active)).toEqual([false, false, true]);
  });

  it('parses a full export code end-to-end', async () => {
    const result = await parsePobInput(exportCode(xml));
    expect(result.build?.className).toBe('Witch');
    expect(result.build?.skillStages).toHaveLength(2);
    expect(result.build?.configStages).toHaveLength(2);
  });

  it('rejects PoB2, truncated XML and unreasonable inputs', () => {
    expect(() => parsePobXml('<PathOfBuilding2></PathOfBuilding2>')).toThrow(/Path of Building 2/);
    expect(() => parsePobXml('<PathOfBuilding><Build /></PathOfBuil')).toThrow(/truncated|malformed/);
    expect(() => describePobInput('not a valid pob !!!')).toThrow();
  });
});
