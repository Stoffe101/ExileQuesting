import { extractRemixContext } from '../src/core/maxroll';

const response = await fetch('https://maxroll.gg/poe/planner/gep906sn', { headers: { 'User-Agent': 'ExileQuesting/schema-probe' } });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const html = await response.text();
const context = extractRemixContext(html) as any;
const entry = context?.state?.loaderData?.['poe-planner-by-id'];
const profile = entry?.profile ?? entry?.data?.profile ?? entry;
const planner = JSON.parse(profile?.data ?? '{}');
const equipment = (Array.isArray(planner.embeds) ? planner.embeds : Object.values(planner.embeds ?? {})).filter((embed: any) => embed?.type === 'equipment');
const shape = (value: any): any => {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return { type: 'array', length: value.length, sample: value.slice(0, 12).map(shape) };
  const result: any = { type: 'object', keys: Object.keys(value) };
  result.values = Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, child]) => [key, typeof child === 'object' ? shape(child) : child]));
  return result;
};
const itemSamples = Object.entries(planner.items ?? {}).slice(0, 12).map(([id, item]: [string, any]) => ({
  id,
  type: typeof item,
  keys: item && typeof item === 'object' ? Object.keys(item) : [],
  safe: typeof item === 'string'
    ? item.split(/\r?\n/).slice(0, 4)
    : Object.fromEntries(Object.entries(item ?? {}).filter(([key]) => /^(name|baseName|title|typeLine|baseType|id|itemId)$/i.test(key)).slice(0, 12)),
}));
console.log(JSON.stringify({ equipment: equipment.map((embed: any) => ({ id: embed.id, name: embed.name, items: shape(embed.items) })), itemSamples }, null, 2));
