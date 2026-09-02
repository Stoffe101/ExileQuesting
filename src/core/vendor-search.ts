import type { LootBaseTarget, LootFilterPlan } from './loot-filter';

export const MAX_VENDOR_SEARCH_CHARS = 250;

export type VendorSearchKind = 'equipment' | 'gems';

export interface VendorSearchQuery {
  kind: VendorSearchKind;
  label: string;
  query: string;
  length: number;
  included: string[];
  omitted: number;
  note: string;
}

export interface VendorSearchPlan {
  equipment?: VendorSearchQuery;
  gems?: VendorSearchQuery;
  warnings: string[];
}

export interface VendorGemTask {
  name: string;
  source?: string;
  status: 'planned' | 'unknown-gem' | 'unavailable';
}

interface SearchAlternative {
  pattern: string;
  label: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatSearch(pattern: string): string {
  const cleaned = pattern.replaceAll('"', '');
  return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

function dedupeAlternatives(alternatives: SearchAlternative[]): SearchAlternative[] {
  const seen = new Set<string>();
  return alternatives.filter((alternative) => {
    const key = alternative.pattern.toLowerCase();
    if (!alternative.pattern || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function packQuery(kind: VendorSearchKind, label: string, alternatives: SearchAlternative[], note: string): VendorSearchQuery | undefined {
  const unique = dedupeAlternatives(alternatives);
  const selected: SearchAlternative[] = [];
  for (const alternative of unique) {
    const next = formatSearch([...selected, alternative].map((item) => item.pattern).join('|'));
    if (next.length > MAX_VENDOR_SEARCH_CHARS) continue;
    selected.push(alternative);
  }
  if (!selected.length) return undefined;
  const query = formatSearch(selected.map((item) => item.pattern).join('|'));
  return {
    kind,
    label,
    query,
    length: query.length,
    included: selected.map((item) => item.label),
    omitted: unique.length - selected.length,
    note,
  };
}

function basePriority(target: LootBaseTarget): number {
  if (target.slot === 'weapon' || target.slot === 'offhand' || target.slot === 'quiver') return 0;
  if (target.slot === 'boots') return 1;
  if (target.slot === 'body-armour') return 2;
  if (target.slot === 'helmet' || target.slot === 'gloves') return 3;
  return 4;
}

function equipmentAlternatives(plan: LootFilterPlan): SearchAlternative[] {
  const alternatives: SearchAlternative[] = [];
  const bestLink = plan.linkTargets
    .filter((target) => target.links >= 3)
    .sort((left, right) => right.links - left.links)[0];

  if (bestLink) {
    alternatives.push({
      pattern: `sockets: ([rgbw]-){${bestLink.links - 1}}[rgbw]`,
      label: `${bestLink.links}+ linked sockets for ${bestLink.label}`,
    });
  }

  alternatives.push({ pattern: 'movement speed', label: 'movement speed' });

  const bases = plan.baseTargets
    .filter((target) => target.rarity?.toLowerCase() !== 'unique')
    .sort((left, right) => basePriority(left) - basePriority(right) || left.slotName.localeCompare(right.slotName));
  for (const target of bases) {
    const base = normalizeLabel(target.baseType);
    if (!base || base === 'Unknown base') continue;
    alternatives.push({ pattern: escapeRegex(base), label: `${target.slotName}: ${base}` });
  }

  return alternatives;
}

function vendorGemAlternatives(tasks: VendorGemTask[]): SearchAlternative[] {
  return tasks
    .filter((task) => task.status === 'planned' && task.source?.startsWith('Vendor'))
    .map((task) => normalizeLabel(task.name))
    .filter(Boolean)
    .map((name) => ({ pattern: escapeRegex(name), label: name }));
}

export function buildVendorSearchPlan(loot: LootFilterPlan, gemTasks: VendorGemTask[]): VendorSearchPlan {
  const equipment = packQuery(
    'equipment',
    'Gear vendor scan',
    equipmentAlternatives(loot),
    'Highlights any listed alternative. Socket colours are intentionally ignored for compatibility in PoE 3.29; matching colours are only a quality bonus.',
  );
  const gems = packQuery(
    'gems',
    'Gem vendor scan',
    vendorGemAlternatives(gemTasks),
    'Contains only planned gems whose preferred acquisition source for this stage is a vendor.',
  );

  const warnings: string[] = [];
  if (equipment?.omitted) warnings.push(`${equipment.omitted} lower-priority gear search target${equipment.omitted === 1 ? ' was' : 's were'} omitted to stay within Path of Exile's ${MAX_VENDOR_SEARCH_CHARS}-character search limit.`);
  if (gems?.omitted) warnings.push(`${gems.omitted} gem search target${gems.omitted === 1 ? ' was' : 's were'} omitted to stay within Path of Exile's ${MAX_VENDOR_SEARCH_CHARS}-character search limit.`);

  return { equipment, gems, warnings };
}
