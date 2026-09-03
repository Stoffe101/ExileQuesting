export interface MobalyticsSkillGroupSummary {
  label: string;
  slot?: string;
  gems: string[];
}

export interface MobalyticsEquipmentSummary {
  slot: string;
  name?: string;
  baseType?: string;
  rarity?: string;
}

export interface MobalyticsVariantSummary {
  id?: string;
  title?: string;
  level?: number;
  passiveNodeIds: number[];
  skillGroups: MobalyticsSkillGroupSummary[];
  equipment: MobalyticsEquipmentSummary[];
}

export interface MobalyticsBuildMetadata {
  buildUrl: string;
  pobCode?: string;
  variants: MobalyticsVariantSummary[];
}

type UnknownRecord = Record<string, unknown>;

const MAX_URL_LENGTH = 1000;
const MAX_STATE_CHARS = 16 * 1024 * 1024;
const MAX_RECURSION_DEPTH = 14;
const MAX_OBJECT_CHILDREN = 5000;
const MAX_VARIANTS = 60;
const MAX_PASSIVE_NODES = 1024;
const MAX_SKILL_GROUPS = 40;
const MAX_GEMS_PER_GROUP = 24;
const MAX_EQUIPMENT_SLOTS = 40;
const MAX_POB_CODE_CHARS = 8 * 1024 * 1024;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : undefined;
}

function text(value: unknown, max = 240): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function safeLevel(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : undefined;
}

export function isMobalyticsBuildUrl(value: string): boolean {
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || (url.port && url.port !== '443')
      || !['mobalytics.gg', 'www.mobalytics.gg'].includes(host)
      || url.search
      || url.hash
    ) return false;
    return /^\/poe\/builds\/[a-z0-9-]+\/?$/i.test(url.pathname)
      || /^\/poe\/profile\/[a-z0-9_-]+\/builds\/[a-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function canonicalMobalyticsBuildUrl(value: string): string {
  if (!isMobalyticsBuildUrl(value)) throw new Error('Mobalytics build input expects a public https://mobalytics.gg/poe/.../builds/... URL.');
  const url = new URL(value.trim());
  return `https://mobalytics.gg${url.pathname.replace(/\/$/, '')}`;
}

/**
 * Extract the JSON assigned to window.__PRELOADED_STATE__ without evaluating
 * page script. This parser is deliberately quote/escape-aware and bounded so a
 * provider page cannot turn into executable application input.
 */
export function extractMobalyticsPreloadedState(html: string): UnknownRecord | undefined {
  if (!html || html.length > MAX_STATE_CHARS) return undefined;
  const marker = 'window.__PRELOADED_STATE__';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const equalsIndex = html.indexOf('=', markerIndex + marker.length);
  if (equalsIndex < 0 || equalsIndex - markerIndex > 64) return undefined;
  const start = html.indexOf('{', equalsIndex + 1);
  if (start < 0 || start - equalsIndex > 32) return undefined;

  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = false;
      continue;
    }
    if (character === '"') quote = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return record(JSON.parse(html.slice(start, index + 1)) as unknown); }
        catch { return undefined; }
      }
      if (depth < 0) return undefined;
    }
  }
  return undefined;
}

function unwrapBuildCandidate(value: unknown): UnknownRecord | undefined {
  let current = record(value);
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current.buildVariants || current.pobCode) return current;
    const data = record(current.data);
    if (!data || data === current) return undefined;
    current = data;
  }
  return undefined;
}

export function findMobalyticsPoe1Document(value: unknown): UnknownRecord | undefined {
  const seen = new Set<object>();
  const visit = (candidate: unknown, depth: number): UnknownRecord | undefined => {
    if (depth > MAX_RECURSION_DEPTH || candidate == null) return undefined;
    if (Array.isArray(candidate)) {
      for (const child of candidate.slice(0, MAX_OBJECT_CHILDREN)) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const source = record(candidate);
    if (!source || seen.has(source)) return undefined;
    seen.add(source);

    const direct = unwrapBuildCandidate(source);
    if (direct && (direct.buildVariants || direct.pobCode)) return direct;

    for (const key of ['userGeneratedDocumentBySlug', 'userGeneratedDocumentBySlugifiedName']) {
      const found = unwrapBuildCandidate(source[key]);
      if (found) return found;
    }
    for (const child of Object.values(source).slice(0, MAX_OBJECT_CHILDREN)) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(value, 0);
}

function selectedNodeIds(tree: unknown): number[] {
  const source = record(tree);
  const raw = Array.isArray(source?.selectedSlugs) ? source.selectedSlugs : [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const candidate of raw.slice(0, MAX_PASSIVE_NODES)) {
    if (typeof candidate !== 'string') continue;
    const match = /^node-(\d+)$/.exec(candidate.trim());
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function passiveNodeIds(variant: UnknownRecord): number[] {
  const tree = record(variant.passiveTree);
  if (!tree) return [];
  const ids = [
    ...selectedNodeIds(tree.mainTree),
    ...selectedNodeIds(tree.ascendancyTree),
    ...selectedNodeIds(tree.alternateAscendancyTree),
  ];
  return [...new Set(ids)].slice(0, MAX_PASSIVE_NODES);
}

function skillGroups(variant: UnknownRecord): MobalyticsSkillGroupSummary[] {
  const skills = record(variant.skills);
  const rawGroups = Array.isArray(skills?.gemGroups) ? skills.gemGroups : [];
  return rawGroups.slice(0, MAX_SKILL_GROUPS).flatMap((candidate, index) => {
    const group = record(candidate);
    if (!group) return [];
    const rawGems = Array.isArray(group.gems) ? group.gems : [];
    const gems = rawGems.slice(0, MAX_GEMS_PER_GROUP).flatMap((entry) => {
      const gem = record(entry);
      const skillGemObject = record(gem?.skillGemObject);
      const data = record(skillGemObject?.data);
      const name = text(data?.name, 160) ?? text(skillGemObject?.name, 160) ?? text(gem?.name, 160);
      return name ? [name] : [];
    });
    if (!gems.length) return [];
    return [{
      label: text(group.label, 160) ?? text(group.name, 160) ?? `Skill group ${index + 1}`,
      slot: text(group.slotSlug, 80),
      gems: [...new Set(gems)],
    }];
  });
}

function equipment(variant: UnknownRecord): MobalyticsEquipmentSummary[] {
  const builder = record(variant.genericBuilder);
  const slots = Array.isArray(builder?.slots) ? builder.slots : [];
  return slots.slice(0, MAX_EQUIPMENT_SLOTS).flatMap((candidate) => {
    const slot = record(candidate);
    const slotName = text(slot?.gameSlotSlug, 80);
    const entity = record(slot?.gameEntity);
    if (!slotName || !entity) return [];
    const data = record(entity.data);
    const rarity = text(data?.rarity, 40)?.toUpperCase();
    const title = text(entity.title, 180);
    const itemName = text(data?.name, 180);
    const subtitle = text(data?.subTitle, 180);
    return [{
      slot: slotName,
      name: rarity === 'UNIQUE' ? title ?? itemName : itemName && itemName !== 'New Item' ? itemName : undefined,
      baseType: rarity === 'UNIQUE' ? subtitle ?? title : title ?? subtitle,
      rarity,
    }];
  });
}

function variantTitle(variant: UnknownRecord): string | undefined {
  return text(variant.title, 160)
    ?? text(variant.name, 160)
    ?? text(variant.label, 160)
    ?? text(variant.displayName, 160);
}

function variantsFromDocument(document: UnknownRecord): MobalyticsVariantSummary[] {
  const family = record(document.buildVariants);
  const raw = Array.isArray(family?.values) ? family.values : Array.isArray(document.buildVariants) ? document.buildVariants : [];
  return raw.slice(0, MAX_VARIANTS).flatMap((candidate) => {
    const variant = record(candidate);
    if (!variant) return [];
    return [{
      id: text(variant.id, 120) ?? (typeof variant.id === 'number' && Number.isSafeInteger(variant.id) ? String(variant.id) : undefined),
      title: variantTitle(variant),
      level: safeLevel(variant.level ?? variant.characterLevel ?? variant.requiredLevel),
      passiveNodeIds: passiveNodeIds(variant),
      skillGroups: skillGroups(variant),
      equipment: equipment(variant),
    }];
  });
}

export function parseMobalyticsEmbeddedBuild(buildUrl: string, html: string): MobalyticsBuildMetadata {
  const canonicalUrl = canonicalMobalyticsBuildUrl(buildUrl);
  const state = extractMobalyticsPreloadedState(html);
  if (!state) throw new Error('Mobalytics page did not expose the expected bounded __PRELOADED_STATE__ payload.');
  const document = findMobalyticsPoe1Document(state);
  if (!document) throw new Error('Mobalytics page state did not contain a recognizable PoE1 build document.');
  const pobCode = text(document.pobCode, MAX_POB_CODE_CHARS);
  const variants = variantsFromDocument(document);
  if (!pobCode && !variants.length) throw new Error('Mobalytics build document contained neither a PoB code nor structured build variants.');
  return { buildUrl: canonicalUrl, pobCode, variants };
}

export function mobalyticsPobCodeFromHtml(buildUrl: string, html: string): string | undefined {
  return parseMobalyticsEmbeddedBuild(buildUrl, html).pobCode;
}
