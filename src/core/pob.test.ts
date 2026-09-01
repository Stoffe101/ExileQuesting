import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePobExportCode, describePobInput, parsePobInput, parsePobXml } from './pob';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="38" className="Witch" ascendClassName="Elementalist" targetVersion="3_28" mainSocketGroup="1" />
  <Tree activeSpec="2">
    <Spec id="1" title="Level 12" treeVersion="3_28" nodes="1,2" />
    <Spec id="2" title="Level 38" treeVersion="3_28" nodes="1,2,3" />
  </Tree>
  <Skills activeSkillSet="2">
    <SkillSet id="1" title="Early"><Skill label="Main"><Gem nameSpec="Rolling Magma" level="10" enabled="true" /></Skill></SkillSet>
    <SkillSet id="2" title="Act 4"><Skill label="Main"><Gem nameSpec="Armageddon Brand" skillId="ArmageddonBrand" level="1" enabled="true"/><Gem nameSpec="Combustion" level="1" enabled="true"/></Skill></SkillSet>
  </Skills>
  <Items activeItemSet="2"><ItemSet id="1" title="Early"/><ItemSet id="2" title="Act 4"/></Items>
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

  it('parses class, ascendancy and named tree/skill/item stages', () => {
    const build = parsePobXml(xml);
    expect(build.className).toBe('Witch');
    expect(build.ascendancy).toBe('Elementalist');
    expect(build.level).toBe(38);
    expect(build.treeStages.map((stage) => stage.title)).toEqual(['Level 12', 'Level 38']);
    expect(build.treeStages[1].active).toBe(true);
    expect(build.skillStages[1].active).toBe(true);
    expect(build.itemStages[1].active).toBe(true);
    expect(build.activeSkillGroups[0].gems.map((gem) => gem.name)).toEqual(['Armageddon Brand', 'Combustion']);
    expect(build.notes).toContain('Switch at level 28');
  });

  it('parses a full export code end-to-end', async () => {
    const result = await parsePobInput(exportCode(xml));
    expect(result.build?.className).toBe('Witch');
    expect(result.build?.skillStages).toHaveLength(2);
  });

  it('rejects PoB2, truncated XML and unreasonable inputs', () => {
    expect(() => parsePobXml('<PathOfBuilding2></PathOfBuilding2>')).toThrow(/Path of Building 2/);
    expect(() => parsePobXml('<PathOfBuilding><Build /></PathOfBuil')).toThrow(/truncated|malformed/);
    expect(() => describePobInput('not a valid pob !!!')).toThrow();
  });
});
