export type PobInputKind = 'xml' | 'export-code' | 'pobbin';
export type PobStageKind = 'tree' | 'skills' | 'items' | 'config';

export interface PobInputDescriptor {
  kind: PobInputKind;
  value: string;
  pobbinRawUrl?: string;
}

export interface PobMasterySelection {
  nodeId: number;
  effectId: number;
}

export interface PobStageSummary {
  /** Stable ExileQuesting-local identity. Never assumes PoB set IDs align across families. */
  id: string;
  /** Native PoB set ID when the container actually has one. Passive specs are ordinal in modern PoB. */
  sourceId?: string;
  title: string;
  kind: PobStageKind;
  active: boolean;
  ordinal: number;
  treeVersion?: string;
  classId?: number;
  ascendClassId?: number;
  secondaryAscendClassId?: number;
  nodeIds?: number[];
  masterySelections?: PobMasterySelection[];
}

export interface PobGemSummary {
  name: string;
  skillId?: string;
  level?: number;
  quality?: number;
  enabled: boolean;
}

export interface PobSkillGroupSummary {
  label?: string;
  enabled: boolean;
  gems: PobGemSummary[];
}

export interface PobBuildSummary {
  root: 'PathOfBuilding';
  className?: string;
  ascendancy?: string;
  level?: number;
  targetVersion?: string;
  mainSocketGroup?: number;
  notes?: string;
  treeStages: PobStageSummary[];
  skillStages: PobStageSummary[];
  itemStages: PobStageSummary[];
  configStages: PobStageSummary[];
  activeSkillGroups: PobSkillGroupSummary[];
  warnings: string[];
}

export const MAX_POB_INPUT_CHARS = 8 * 1024 * 1024;
export const MAX_POB_XML_BYTES = 16 * 1024 * 1024;

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/gs)) result[match[1]] = decodeXmlEntities(match[3]);
  return result;
}

function integer(value: string | undefined): number | undefined {
  if (!value || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function cleanText(value: string): string {
  return decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')).trim();
}

function integerList(value: string | undefined): number[] | undefined {
  if (!value?.trim()) return undefined;
  const result = [...value.matchAll(/\d+/g)].map((match) => Number(match[0])).filter(Number.isSafeInteger);
  return result.length ? result : undefined;
}

function masterySelections(value: string | undefined): PobMasterySelection[] | undefined {
  if (!value) return undefined;
  const result: PobMasterySelection[] = [];
  for (const match of value.matchAll(/\{(\d+),(\d+)\}/g)) {
    const nodeId = Number(match[1]);
    const effectId = Number(match[2]);
    if (Number.isSafeInteger(nodeId) && Number.isSafeInteger(effectId)) result.push({ nodeId, effectId });
  }
  return result.length ? result : undefined;
}

interface StageContainerDefinition {
  container: 'Tree' | 'Skills' | 'Items' | 'Config';
  child: 'Spec' | 'SkillSet' | 'ItemSet' | 'ConfigSet';
  kind: PobStageKind;
  activeAttribute: 'activeSpec' | 'activeSkillSet' | 'activeItemSet' | 'activeConfigSet';
  fallbackLabel: string;
  /** Modern PoB passive specs are selected by 1-based ordinal, not a child `id`. */
  activeByOrdinal?: boolean;
}

function stageTags(xml: string, definition: StageContainerDefinition): PobStageSummary[] {
  const containerMatch = xml.match(new RegExp(`<${definition.container}\\b([^>]*)>([\\s\\S]*?)<\\/${definition.container}>`, 'i'));
  if (!containerMatch) return [];
  const parent = attributes(containerMatch[1]);
  const activeValue = parent[definition.activeAttribute];
  const activeOrdinal = definition.activeByOrdinal ? integer(activeValue) : undefined;
  const result: PobStageSummary[] = [];
  const regex = new RegExp(`<${definition.child}\\b([^>]*)`, 'gi');
  let match: RegExpExecArray | null;
  let ordinal = 0;
  while ((match = regex.exec(containerMatch[2]))) {
    ordinal += 1;
    const attrs = attributes(match[1]);
    const sourceId = attrs.id?.trim() || undefined;
    const active = definition.activeByOrdinal
      ? (activeOrdinal ? activeOrdinal === ordinal : ordinal === 1)
      : (activeValue ? activeValue === sourceId : ordinal === 1);
    result.push({
      // Family + ordinal is deterministic and cannot collide merely because two trees use the same game version.
      id: `${definition.kind}:${ordinal}`,
      sourceId,
      title: attrs.title?.trim() || `${definition.fallbackLabel} ${ordinal}`,
      kind: definition.kind,
      active,
      ordinal,
      treeVersion: definition.kind === 'tree' ? attrs.treeVersion || undefined : undefined,
      classId: definition.kind === 'tree' ? integer(attrs.classId) : undefined,
      ascendClassId: definition.kind === 'tree' ? integer(attrs.ascendClassId) : undefined,
      secondaryAscendClassId: definition.kind === 'tree' ? integer(attrs.secondaryAscendClassId) : undefined,
      nodeIds: definition.kind === 'tree' ? integerList(attrs.nodes) : undefined,
      masterySelections: definition.kind === 'tree' ? masterySelections(attrs.masteryEffects) : undefined,
    });
  }
  return result;
}

function activeSkillGroups(xml: string): PobSkillGroupSummary[] {
  const skillsMatch = xml.match(/<Skills\b([^>]*)>([\s\S]*?)<\/Skills>/i);
  if (!skillsMatch) return [];
  const parent = attributes(skillsMatch[1]);
  const activeId = parent.activeSkillSet;
  let body = skillsMatch[2];
  if (activeId) {
    const escaped = activeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const active = body.match(new RegExp(`<SkillSet\\b([^>]*)\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/SkillSet>`, 'i'));
    if (active) body = active[2];
  }
  const groups: PobSkillGroupSummary[] = [];
  const skillRegex = /<Skill\b([^>]*)>([\s\S]*?)<\/Skill>/gi;
  let skill: RegExpExecArray | null;
  while ((skill = skillRegex.exec(body))) {
    const skillAttrs = attributes(skill[1]);
    const gems: PobGemSummary[] = [];
    const gemRegex = /<Gem\b([^>]*?)(?:\/?>)/gi;
    let gem: RegExpExecArray | null;
    while ((gem = gemRegex.exec(skill[2]))) {
      const gemAttrs = attributes(gem[1]);
      const name = gemAttrs.nameSpec || gemAttrs.name || gemAttrs.gemId || gemAttrs.skillId;
      if (!name) continue;
      gems.push({
        name,
        skillId: gemAttrs.skillId || gemAttrs.gemId,
        level: integer(gemAttrs.level),
        quality: integer(gemAttrs.quality),
        enabled: gemAttrs.enabled !== 'false',
      });
    }
    groups.push({ label: skillAttrs.label || undefined, enabled: skillAttrs.enabled !== 'false', gems });
  }
  return groups;
}

export function describePobInput(input: string): PobInputDescriptor {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('PoB input is empty.');
  if (trimmed.length > MAX_POB_INPUT_CHARS) throw new Error('PoB input is too large.');
  if (/^<\?xml\b|^<PathOfBuilding\b/i.test(trimmed)) return { kind: 'xml', value: trimmed };
  const urlMatch = trimmed.match(/^https?:\/\/(?:www\.)?pobb\.in\/([A-Za-z0-9_-]{2,80})(?:[/?#].*)?$/i);
  if (urlMatch) return { kind: 'pobbin', value: trimmed, pobbinRawUrl: `https://pobb.in/${urlMatch[1]}/raw` };
  if (/^[A-Za-z0-9_\-+/=\s]+$/.test(trimmed)) return { kind: 'export-code', value: trimmed.replace(/\s+/g, '') };
  throw new Error('Input is not recognized as PoB XML, an export code, or a pobb.in link.');
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { throw new Error('PoB export code is not valid Base64.'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function inflateWith(format: 'deflate' | 'deflate-raw', bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_POB_XML_BYTES) {
      await reader.cancel();
      throw new Error('Decoded PoB XML exceeds the safety size limit.');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(merged).trim();
}

export async function decodePobExportCode(input: string): Promise<string> {
  const descriptor = describePobInput(input);
  if (descriptor.kind === 'xml') return descriptor.value;
  if (descriptor.kind === 'pobbin') throw new Error('pobb.in links must be fetched from their /raw endpoint before decoding.');
  const bytes = base64UrlBytes(descriptor.value);
  try { return await inflateWith('deflate', bytes); }
  catch (firstError) {
    try { return await inflateWith('deflate-raw', bytes); }
    catch {
      throw firstError instanceof Error && /safety size limit/.test(firstError.message) ? firstError : new Error('PoB export code could not be decompressed as a zlib/deflate stream.');
    }
  }
}

export function parsePobXml(xml: string): PobBuildSummary {
  const trimmed = xml.trim();
  if (!trimmed) throw new Error('PoB XML is empty.');
  if (new TextEncoder().encode(trimmed).byteLength > MAX_POB_XML_BYTES) throw new Error('PoB XML exceeds the safety size limit.');
  const root = trimmed.replace(/^<\?xml[^>]*>\s*/i, '').match(/^<([A-Za-z0-9]+)\b/i)?.[1];
  if (root === 'PathOfBuilding2') throw new Error('This is a Path of Building 2 build. ExileQuesting currently targets Path of Exile 1.');
  if (root !== 'PathOfBuilding') throw new Error(`Expected <PathOfBuilding> XML, found ${root ? `<${root}>` : 'no root element'}.`);
  if (!/<\/PathOfBuilding>\s*$/i.test(trimmed)) throw new Error('PoB XML appears truncated or malformed.');

  const buildTag = trimmed.match(/<Build\b([^>]*)>/i);
  const build = attributes(buildTag?.[1] ?? '');
  const notesMatch = trimmed.match(/<Notes\b[^>]*>([\s\S]*?)<\/Notes>/i);
  const warnings: string[] = [];
  const treeStages = stageTags(trimmed, { container: 'Tree', child: 'Spec', kind: 'tree', activeAttribute: 'activeSpec', fallbackLabel: 'Tree', activeByOrdinal: true });
  const skillStages = stageTags(trimmed, { container: 'Skills', child: 'SkillSet', kind: 'skills', activeAttribute: 'activeSkillSet', fallbackLabel: 'Skills' });
  const itemStages = stageTags(trimmed, { container: 'Items', child: 'ItemSet', kind: 'items', activeAttribute: 'activeItemSet', fallbackLabel: 'Items' });
  const configStages = stageTags(trimmed, { container: 'Config', child: 'ConfigSet', kind: 'config', activeAttribute: 'activeConfigSet', fallbackLabel: 'Config' });
  if (!treeStages.length) warnings.push('No passive-tree stages were found.');
  if (!skillStages.length) warnings.push('No named skill stages were found; this may be an older/simpler PoB export.');
  if (!itemStages.length) warnings.push('No named item stages were found; this may be an older/simpler PoB export.');
  if (!configStages.length) warnings.push('No named configuration stages were found; this may be an older/simpler PoB export.');

  return {
    root: 'PathOfBuilding',
    className: build.className || undefined,
    ascendancy: build.ascendClassName || undefined,
    level: integer(build.level),
    targetVersion: build.targetVersion || undefined,
    mainSocketGroup: integer(build.mainSocketGroup),
    notes: notesMatch ? cleanText(notesMatch[1]) : undefined,
    treeStages,
    skillStages,
    itemStages,
    configStages,
    activeSkillGroups: activeSkillGroups(trimmed),
    warnings,
  };
}

export async function parsePobInput(input: string): Promise<{ descriptor: PobInputDescriptor; xml?: string; build?: PobBuildSummary }> {
  const descriptor = describePobInput(input);
  if (descriptor.kind === 'pobbin') return { descriptor };
  const xml = descriptor.kind === 'xml' ? descriptor.value : await decodePobExportCode(descriptor.value);
  return { descriptor, xml, build: parsePobXml(xml) };
}
