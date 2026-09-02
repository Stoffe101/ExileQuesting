import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

async function patch(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next !== source) await writeFile(path, next, 'utf8');
}

await patch('src/core/maxroll.ts', (input) => {
  let source = input;
  source = replaceOnce(
    source,
    `export interface MaxrollEquipmentMilestone {
  id: string;
  name: string;
  itemNames: string[];
}`,
    `export interface MaxrollEquipmentSlot {
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
}`,
    'equipment milestone interface',
  );

  source = replaceOnce(
    source,
    `function plannerItemName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const lines = value.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
    return lines.find((line) => !/^Rarity:/i.test(line) && line !== '--------' && !/^Item Class:/i.test(line))?.slice(0, 160);
  }
  const item = record(value);
  if (!item) return undefined;
  return text(item.name, 160) ?? text(item.title, 160) ?? text(item.typeLine, 160) ?? text(item.baseType, 160) ?? text(item.baseName, 160);
}

function itemRefs(value: unknown, depth = 0, output: string[] = []): string[] {
  if (depth > 5 || output.length >= 120 || value == null) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const ref = String(value);
    if (/^[A-Za-z0-9_-]{1,80}$/.test(ref)) output.push(ref);
    return output;
  }
  if (Array.isArray(value)) {
    value.slice(0, 80).forEach((child) => itemRefs(child, depth + 1, output));
    return output;
  }
  const source = record(value);
  if (!source) return output;
  Object.values(source).slice(0, 80).forEach((child) => itemRefs(child, depth + 1, output));
  return output;
}

function equipmentMilestones(planner: UnknownRecord, embeds: UnknownRecord[]): MaxrollEquipmentMilestone[] {
  const rawItems = record(planner.items) ?? {};
  const names = new Map<string, string>();
  for (const [id, value] of Object.entries(rawItems).slice(0, 500)) {
    const name = plannerItemName(value);
    if (name) names.set(id, name);
  }
  return embeds.filter((embed) => embed.type === 'equipment').slice(0, MAX_MILESTONES).map((embed, index) => ({
    id: String(text(embed.id, 80) ?? index + 1),
    name: text(embed.name, 160) ?? \`Equipment \${index + 1}\`,
    itemNames: uniqueStrings(itemRefs(embed.items).map((ref) => names.get(ref)), 16),
  }));
}`,
    `function plannerItemName(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const lines = value.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
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
      name: text(embed.name, 160) ?? \`Equipment \${index + 1}\`,
      itemNames: uniqueStrings(slots.map((slot) => slot.name), 24),
      slots,
    };
  });
}`,
    'equipment parser',
  );

  source = replaceOnce(
    source,
    `    return [{
      id: text(item.id, 80) ?? String(index + 1),
      name,
      itemNames: uniqueStrings(safeArray(item.itemNames).map((entry) => text(entry, 160)), 16),
    }];`,
    `    const slots = safeArray(item.slots).slice(0, 40).flatMap((candidate) => {
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
    }];`,
    'equipment persistence',
  );
  return source;
});

await patch('src/core/build-coach.ts', (source) => replaceOnce(
  source,
  `  equipmentMilestones: Array<{ id: string; name: string; itemNames: string[] }>;`,
  `  equipmentMilestones: Array<{ id: string; name: string; itemNames: string[]; slots: Array<{ slot: string; itemId: string; name?: string; baseId?: string; uniqueId?: string }> }>;`,
  'build coach equipment type',
));

console.log('Applied Maxroll equipment metadata integration.');
