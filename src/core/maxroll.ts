import type { PassiveTreeSnapshot } from './passive-data';
import type { PobBuildSummary, PobGemSummary, PobSkillGroupSummary, PobStageSummary } from './pob';

export type MaxrollGuideMode = 'league-start' | 'twink';
export type MaxrollCompatibility = 'current' | 'compatible-ids' | 'stale' | 'guide-only';

export interface MaxrollPassiveOperation {
  type: 'allocate' | 'refund';
  nodeId: number;
  checkpoint: number;
}

export interface MaxrollEquipmentSlot {
  slot: string;
  itemId: string;
  name?: string;
  baseId?: string;
  uniqueId?: string;
}

export interface MaxrollEquipmentMilestone {
  id: string;
  name: string;
  itemNames: string[];
  slots: MaxrollEquipmentSlot[];
}

export interface MaxrollGuideMetadata {
  guideUrl: string;
  guideTitle: string;
  guideSlug: string;
  guideModified?: string;
  mode: MaxrollGuideMode;
  plannerId?: string;
  plannerUrl?: string;
  legacyPlannerRef?: string;
  plannerTreeVersion?: string;
  compatibility: MaxrollCompatibility;
  compatibilityMessage: string;
  passiveOperations: MaxrollPassiveOperation[];
  skillMilestones: string[];
  equipmentMilestones: MaxrollEquipmentMilestone[];
  alternateSkillPaths: string[];
}

export interface ParsedMaxrollGuide {
  metadata: MaxrollGuideMetadata;
  build: PobBuildSummary;
}

type UnknownRecord = Record<string, unknown>;

const MAX_GUIDE_URL = 1000;
const MAX_OPERATIONS = 512;
const MAX_MILESTONES = 80;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function text(value: unknown, max = 240): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values: Array<string | undefined>, limit = MAX_MILESTONES): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, limit);
}

export function isMaxrollGuideUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (host === 'maxroll.gg' || host === 'www.maxroll.gg')
      && /^\/poe\/build-guides\/[a-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function canonicalMaxrollGuideUrl(value: string): string {
  if (!isMaxrollGuideUrl(value)) throw new Error('Maxroll import expects a public https://maxroll.gg/poe/build-guides/... URL.');
  const url = new URL(value.trim());
  return `https://maxroll.gg${url.pathname.replace(/\/$/, '')}`;
}

export function extractRemixContext(html: string): UnknownRecord | null {
  const marker = 'window.__remixContext = ';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = markerIndex + marker.length;
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
        try { return record(JSON.parse(html.slice(start, index + 1))); }
        catch { return null; }
      }
    }
  }
  return null;
}

function guidePost(html: string): UnknownRecord | null {
  const context = extractRemixContext(html);
  const state = record(context?.state);
  const loader = record(state?.loaderData);
  const branchPosts = record(loader?.['branch-posts']);
  return record(branchPosts?.post) ?? record(record(branchPosts?.data)?.post);
}

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function slugFromUrl(url: string): string {
  try { return new URL(url).pathname.split('/').filter(Boolean).at(-1)?.slice(0, 180) ?? 'maxroll-guide'; }
  catch { return 'maxroll-guide'; }
}

function directPlannerId(html: string): string | undefined {
  return html.match(/(?:https?:\/\/maxroll\.gg)?\/poe\/planner\/([A-Za-z0-9_-]{3,80})/i)?.[1];
}

function legacyPlannerRef(post: UnknownRecord | null): string | undefined {
  const visit = (value: unknown, depth = 0): string | undefined => {
    if (depth > 10) return undefined;
    if (typeof value === 'string') {
      const decoded = decodeHtml(value);
      const match = decoded.match(/https:\/\/backend\.maxroll\.net\/poe\/poe-planner\/([A-Za-z0-9_-]{3,80})([^\s"'<>]*)/i);
      return match ? `https://backend.maxroll.net/poe/poe-planner/${match[1]}${match[2] ?? ''}`.slice(0, 500) : undefined;
    }
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 500)) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return undefined;
    }
    const source = record(value);
    if (!source) return undefined;
    for (const child of Object.values(source)) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(post);
}

function plannerIdFromLegacyRef(value?: string): string | undefined {
  return value?.match(/\/poe\/poe-planner\/([A-Za-z0-9_-]{3,80})/i)?.[1];
}

export function maxrollPlannerIdFromHtml(html: string): string | undefined {
  const post = guidePost(html);
  return directPlannerId(html) ?? plannerIdFromLegacyRef(legacyPlannerRef(post));
}

function plannerProfile(html: string): UnknownRecord | null {
  const context = extractRemixContext(html);
  const loader = record(record(context?.state)?.loaderData);
  const entry = record(loader?.['poe-planner-by-id']);
  return record(entry?.profile) ?? record(record(entry?.data)?.profile) ?? entry;
}

function camelWords(value: string): string {
  return value
    .replace(/^Metadata\/Items\/Gems\/(?:SkillGem|SupportGem)/i, '')
    .replace(/^(?:SkillGem|SupportGem)/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function gemSummary(value: unknown): PobGemSummary | undefined {
  if (typeof value === 'string') return { name: camelWords(value) || value, skillId: value, enabled: true };
  const source = record(value);
  if (!source) return undefined;
  const skillId = text(source.skillId, 300) ?? text(source.gemId, 300) ?? text(source.id, 300) ?? text(source.skill, 300);
  const name = text(source.name, 160) ?? text(source.label, 160) ?? text(source.gemName, 160) ?? (skillId ? camelWords(skillId) : undefined);
  if (!name) return undefined;
  return {
    name,
    skillId,
    level: integer(source.level),
    quality: integer(source.quality),
    enabled: source.enabled !== false && source.active !== false,
  };
}

function skillGroups(step: UnknownRecord): PobSkillGroupSummary[] {
  const rawGroups = safeArray(step.skills ?? step.groups ?? step.skillGroups);
  return rawGroups.flatMap((candidate, index) => {
    const group = record(candidate);
    if (!group) return [];
    const gems = safeArray(group.gems ?? group.skills)
      .map(gemSummary)
      .filter((gem): gem is PobGemSummary => Boolean(gem));
    if (!gems.length) return [];
    return [{
      label: text(group.name, 160) ?? text(group.label, 160) ?? text(group.item, 160) ?? `Skill group ${index + 1}`,
      enabled: group.enabled !== false && group.active !== false,
      gems,
    }];
  });
}

function classNameFromMaxroll(value: unknown, guideTitle: string): string | undefined {
  const raw = text(value, 80)?.toLowerCase();
  const map: Record<string, string> = {
    dex: 'Ranger', ranger: 'Ranger', deadeye: 'Ranger', pathfinder: 'Ranger', warden: 'Ranger', raider: 'Ranger',
    str: 'Marauder', marauder: 'Marauder', juggernaut: 'Marauder', berserker: 'Marauder', chieftain: 'Marauder',
    int: 'Witch', witch: 'Witch', necromancer: 'Witch', elementalist: 'Witch', occultist: 'Witch',
    dexint: 'Shadow', intdex: 'Shadow', shadow: 'Shadow', assassin: 'Shadow', saboteur: 'Shadow', trickster: 'Shadow',
    strdex: 'Duelist', dexstr: 'Duelist', duelist: 'Duelist', slayer: 'Duelist', gladiator: 'Duelist', champion: 'Duelist',
    strint: 'Templar', intstr: 'Templar', templar: 'Templar', inquisitor: 'Templar', hierophant: 'Templar', guardian: 'Templar',
    scion: 'Scion', ascendant: 'Scion',
  };
  const compact = raw?.replace(/[^a-z]/g, '');
  if (compact && map[compact]) return map[compact];
  return ['Ranger', 'Marauder', 'Witch', 'Shadow', 'Duelist', 'Templar', 'Scion']
    .find((name) => new RegExp(`\\b${name}\\b`, 'i').test(guideTitle));
}

function versionString(value: unknown): string | undefined {
  const numeric = integer(value);
  if (!numeric) return text(value, 40);
  if (numeric >= 300 && numeric <= 399) return `${Math.floor(numeric / 100)}.${numeric % 100}`;
  return String(numeric);
}

function passiveOperations(embed: UnknownRecord): MaxrollPassiveOperation[] {
  const variants = safeArray(embed.variants).map(record).filter((item): item is UnknownRecord => Boolean(item));
  const activeIndex = Math.max(0, Math.min(Math.max(0, variants.length - 1), (integer(embed.active) ?? 1) - 1));
  const variant = variants[activeIndex] ?? variants[0];
  if (!variant) return [];
  const operations: MaxrollPassiveOperation[] = [];
  safeArray(variant.history).slice(0, MAX_OPERATIONS).forEach((candidate, checkpointIndex) => {
    const scalarNode = integer(candidate);
    if (scalarNode !== undefined) {
      operations.push({ type: 'allocate', nodeId: scalarNode, checkpoint: checkpointIndex + 1 });
      return;
    }
    const event = record(candidate);
    if (!event) return;
    for (const nodeId of safeArray(event.remove).map(integer).filter((id): id is number => id !== undefined)) {
      if (operations.length < MAX_OPERATIONS) operations.push({ type: 'refund', nodeId, checkpoint: checkpointIndex + 1 });
    }
    for (const nodeId of safeArray(event.add).map(integer).filter((id): id is number => id !== undefined)) {
      if (operations.length < MAX_OPERATIONS) operations.push({ type: 'allocate', nodeId, checkpoint: checkpointIndex + 1 });
    }
  });
  return operations;
}

function skillStages(embed: UnknownRecord): PobStageSummary[] {
  return safeArray(embed.steps).flatMap((candidate, index) => {
    const step = record(candidate);
    if (!step) return [];
    const groups = skillGroups(step);
    if (!groups.length) return [];
    return [{
      id: `skills:${index + 1}`,
      sourceId: `maxroll:${text(embed.id, 60) ?? 'skills'}:${index + 1}`,
      title: text(step.name, 160) ?? text(step.title, 160) ?? `Skills ${index + 1}`,
      kind: 'skills' as const,
      active: index === 0,
      ordinal: index + 1,
      skillGroups: groups,
    }];
  });
}

function plannerItemName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.find((line) => !/^Rarity:/i.test(line) && line !== '--------' && !/^Item Class:/i.test(line))?.slice(0, 160);
  }
  const item = record(value);
  if (!item) return undefined;
  return text(item.name, 160) ?? text(item.title, 160) ?? text(item.typeLine, 160) ?? text(item.baseType, 160) ?? text(item.baseName, 160);
}

function equipmentMilestones(planner: UnknownRecord, embeds: UnknownRecord[]): MaxrollEquipmentMilestone[] {
  const rawItems = record(planner.items) ?? {};
  return embeds.filter((embed) => embed.type === 'equipment').slice(0, MAX_MILESTONES).map((embed, index) => {
    const slotMap = record(embed.items) ?? {};
    const slots = Object.entries(slotMap).slice(0, 40).flatMap(([slot, rawItemId]) => {
      const itemId = typeof rawItemId === 'string' || typeof rawItemId === 'number' ? String(rawItemId) : undefined;
      if (!itemId || !/^[A-Za-z0-9_-]{1,80}$/.test(itemId)) return [];
      const raw = rawItems[itemId];
      const item = record(raw);
      return [{
        slot: slot.slice(0, 80),
        itemId,
        name: plannerItemName(raw),
        baseId: text(item?.base, 300),
        uniqueId: text(item?.unique, 200),
      }];
    });
    return {
      id: String(text(embed.id, 80) ?? index + 1),
      name: text(embed.name, 160) ?? `Equipment ${index + 1}`,
      itemNames: uniqueStrings(slots.map((slot) => slot.name), 24),
      slots,
    };
  });
}

function buildFromPlanner(profile: UnknownRecord, planner: UnknownRecord, guideTitle: string): {
  build: PobBuildSummary;
  operations: MaxrollPassiveOperation[];
  skillMilestones: string[];
  equipmentMilestones: MaxrollEquipmentMilestone[];
  alternateSkillPaths: string[];
  plannerTreeVersion?: string;
} {
  const embeds = (Array.isArray(planner.embeds) ? planner.embeds : Object.values(record(planner.embeds) ?? {}))
    .map(record).filter((entry): entry is UnknownRecord => Boolean(entry));
  const skillEmbeds = embeds.filter((entry) => entry.type === 'skills');
  const passiveEmbeds = embeds.filter((entry) => entry.type === 'passives');
  const primarySkills = skillEmbeds[0];
  const classHint = classNameFromMaxroll(profile.class, guideTitle);
  const primaryPassive = passiveEmbeds.find((entry) => classNameFromMaxroll(entry.charClass, guideTitle) === classHint)
    ?? passiveEmbeds.find((entry) => entry.active === 1)
    ?? passiveEmbeds[0];
  const operations = primaryPassive ? passiveOperations(primaryPassive) : [];
  const skills = primarySkills ? skillStages(primarySkills) : [];
  const className = classNameFromMaxroll(primaryPassive?.charClass ?? profile.class, guideTitle);
  const ascendancy = text(primaryPassive?.ascendancy, 100);
  const alternateSkillPaths = skillEmbeds.slice(1).map((entry, index) => text(entry.name, 160) ?? `Alternative skill path ${index + 2}`);
  return {
    operations,
    skillMilestones: skills.map((stage) => stage.title),
    equipmentMilestones: equipmentMilestones(planner, embeds),
    alternateSkillPaths,
    plannerTreeVersion: versionString(primaryPassive?.version),
    build: {
      root: 'PathOfBuilding',
      className,
      ascendancy,
      targetVersion: versionString(primaryPassive?.version),
      // Maxroll's passive history is intentionally kept as its own ordered operation stream.
      // Feeding dozens of click-history entries through PoB stage alignment would create false stage relationships.
      treeStages: [],
      skillStages: skills,
      itemStages: [],
      configStages: [],
      activeSkillGroups: skills[0]?.skillGroups ?? [],
      warnings: [
        ...(operations.length ? [] : ['Maxroll planner did not expose passive progression.']),
        ...(skills.length ? [] : ['Maxroll planner did not expose skill progression.']),
      ],
    },
  };
}

function compatibilityFor(operations: MaxrollPassiveOperation[], plannerTreeVersion: string | undefined, snapshot?: PassiveTreeSnapshot): Pick<MaxrollGuideMetadata, 'compatibility' | 'compatibilityMessage'> {
  if (!operations.length) return {
    compatibility: 'guide-only',
    compatibilityMessage: 'This Maxroll guide does not expose structured passive progression. Exact passive coaching is disabled.',
  };
  if (!snapshot) return {
    compatibility: 'stale',
    compatibilityMessage: 'Current passive-tree data is unavailable, so exact Maxroll passive coaching is disabled.',
  };
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  const missing = [...new Set(operations.map((operation) => operation.nodeId))].filter((id) => !ids.has(id));
  if (missing.length) return {
    compatibility: 'stale',
    compatibilityMessage: `${missing.length} Maxroll passive node ID${missing.length === 1 ? '' : 's'} no longer resolve in PoE ${snapshot.gameVersion}. Exact passive coaching is disabled until the guide is updated or mapped.`,
  };
  if (plannerTreeVersion === snapshot.gameVersion) return {
    compatibility: 'current',
    compatibilityMessage: `Maxroll passive progression matches the bundled PoE ${snapshot.gameVersion} tree.`,
  };
  return {
    compatibility: 'compatible-ids',
    compatibilityMessage: `Maxroll labels this planner tree ${plannerTreeVersion ?? 'an older version'}, but every referenced node ID still resolves in the bundled PoE ${snapshot.gameVersion} tree. ExileQuesting uses current node names and keeps this compatibility warning visible.`,
  };
}

export function parseMaxrollGuide(guideUrl: string, guideHtml: string, plannerHtml: string | undefined, passiveSnapshot?: PassiveTreeSnapshot): ParsedMaxrollGuide {
  const canonicalUrl = canonicalMaxrollGuideUrl(guideUrl);
  const post = guidePost(guideHtml);
  const guideTitle = text(post?.title, 200)
    ?? decodeHtml(guideHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? 'Maxroll leveling guide').replace(/<[^>]+>/g, '').trim().slice(0, 200);
  const guideSlug = text(post?.slug, 180) ?? slugFromUrl(canonicalUrl);
  const mode: MaxrollGuideMode = /\btwink\b/i.test(`${guideTitle} ${guideSlug}`) ? 'twink' : 'league-start';
  const legacyRef = legacyPlannerRef(post);
  const plannerId = directPlannerId(guideHtml) ?? plannerIdFromLegacyRef(legacyRef);
  const modified = text(post?.modifiedIso, 80) ?? text(post?.modified, 80);

  let build: PobBuildSummary = {
    root: 'PathOfBuilding',
    className: classNameFromMaxroll(undefined, guideTitle),
    treeStages: [], skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [],
    warnings: ['Maxroll guide imported without a retrievable structured planner.'],
  };
  let operations: MaxrollPassiveOperation[] = [];
  let skillMilestones: string[] = [];
  let equipment: MaxrollEquipmentMilestone[] = [];
  let alternateSkillPaths: string[] = [];
  let plannerTreeVersion: string | undefined;

  if (plannerHtml) {
    const profile = plannerProfile(plannerHtml);
    const rawData = typeof profile?.data === 'string' && profile.data.length <= 8 * 1024 * 1024 ? profile.data : undefined;
    if (!profile || !rawData) throw new Error('Maxroll planner page did not expose bounded structured planner data.');
    let planner: UnknownRecord;
    try { planner = record(JSON.parse(rawData)) ?? {}; }
    catch { throw new Error('Maxroll planner data is malformed.'); }
    const parsed = buildFromPlanner(profile, planner, guideTitle);
    build = parsed.build;
    operations = parsed.operations;
    skillMilestones = parsed.skillMilestones;
    equipment = parsed.equipmentMilestones;
    alternateSkillPaths = parsed.alternateSkillPaths;
    plannerTreeVersion = parsed.plannerTreeVersion;
  }

  const compatibility = compatibilityFor(operations, plannerTreeVersion, passiveSnapshot);
  return {
    build,
    metadata: {
      guideUrl: canonicalUrl,
      guideTitle,
      guideSlug,
      guideModified: modified,
      mode,
      plannerId,
      plannerUrl: plannerId ? `https://maxroll.gg/poe/planner/${plannerId}` : undefined,
      legacyPlannerRef: legacyRef,
      plannerTreeVersion,
      ...compatibility,
      passiveOperations: operations.slice(0, MAX_OPERATIONS),
      skillMilestones: skillMilestones.slice(0, MAX_MILESTONES),
      equipmentMilestones: equipment.slice(0, MAX_MILESTONES),
      alternateSkillPaths: alternateSkillPaths.slice(0, 20),
    },
  };
}

export function normalizeMaxrollMetadata(value: unknown): MaxrollGuideMetadata | undefined {
  const source = record(value);
  const guideUrl = text(source?.guideUrl, MAX_GUIDE_URL);
  const guideTitle = text(source?.guideTitle, 200);
  const guideSlug = text(source?.guideSlug, 180);
  if (!guideUrl || !guideTitle || !guideSlug || !isMaxrollGuideUrl(guideUrl)) return undefined;
  const mode: MaxrollGuideMode = source?.mode === 'twink' ? 'twink' : 'league-start';
  const compatibility: MaxrollCompatibility = ['current', 'compatible-ids', 'stale', 'guide-only'].includes(String(source?.compatibility))
    ? source!.compatibility as MaxrollCompatibility : 'guide-only';
  const passiveOperations = safeArray(source?.passiveOperations).slice(0, MAX_OPERATIONS).flatMap((candidate) => {
    const item = record(candidate);
    const nodeId = integer(item?.nodeId);
    const checkpoint = integer(item?.checkpoint);
    if (!item || nodeId === undefined || checkpoint === undefined || !['allocate', 'refund'].includes(String(item.type))) return [];
    return [{ type: item.type as MaxrollPassiveOperation['type'], nodeId, checkpoint }];
  });
  const equipment = safeArray(source?.equipmentMilestones).slice(0, MAX_MILESTONES).flatMap((candidate, index) => {
    const item = record(candidate);
    const name = text(item?.name, 160);
    if (!item || !name) return [];
    const slots = safeArray(item.slots).slice(0, 40).flatMap((candidate) => {
      const slot = record(candidate);
      const slotName = text(slot?.slot, 80);
      const itemId = text(slot?.itemId, 80);
      if (!slot || !slotName || !itemId) return [];
      return [{
        slot: slotName,
        itemId,
        name: text(slot.name, 160),
        baseId: text(slot.baseId, 300),
        uniqueId: text(slot.uniqueId, 200),
      }];
    });
    return [{
      id: text(item.id, 80) ?? String(index + 1),
      name,
      itemNames: uniqueStrings(safeArray(item.itemNames).map((entry) => text(entry, 160)), 24),
      slots,
    }];
  });
  return {
    guideUrl,
    guideTitle,
    guideSlug,
    guideModified: text(source?.guideModified, 80),
    mode,
    plannerId: text(source?.plannerId, 80),
    plannerUrl: text(source?.plannerUrl, MAX_GUIDE_URL),
    legacyPlannerRef: text(source?.legacyPlannerRef, MAX_GUIDE_URL),
    plannerTreeVersion: text(source?.plannerTreeVersion, 40),
    compatibility,
    compatibilityMessage: text(source?.compatibilityMessage, 700) ?? 'Maxroll compatibility state restored without a detailed message.',
    passiveOperations,
    skillMilestones: uniqueStrings(safeArray(source?.skillMilestones).map((entry) => text(entry, 160))),
    equipmentMilestones: equipment,
    alternateSkillPaths: uniqueStrings(safeArray(source?.alternateSkillPaths).map((entry) => text(entry, 160)), 20),
  };
}
