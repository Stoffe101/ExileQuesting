import { extractRemixContext } from '../src/core/maxroll';

const response = await fetch('https://maxroll.gg/poe/planner/gep906sn', { headers: { 'User-Agent': 'ExileQuesting/schema-probe' } });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const html = await response.text();
const context = extractRemixContext(html) as any;
const entry = context?.state?.loaderData?.['poe-planner-by-id'];
const profile = entry?.profile ?? entry?.data?.profile ?? entry;
const planner = JSON.parse(profile?.data ?? '{}');
const equipment = (Array.isArray(planner.embeds) ? planner.embeds : Object.values(planner.embeds ?? {})).filter((embed: any) => embed?.type === 'equipment');
const refs = [...new Set(equipment.flatMap((embed: any) => Object.values(embed.items ?? {})).map(String))].slice(0, 40);
const compact = (value: any, depth = 0): any => {
  if (depth > 3 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 6).map((child) => compact(child, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => /^(id|name|displayName|baseName|typeLine|base|unique|rarity|customText)$/i.test(key)).map(([key, child]) => [key, compact(child, depth + 1)]));
};
console.log(JSON.stringify({ referencedItems: refs.map((id) => ({ id, identity: compact(planner.items?.[id]) })) }, null, 2));
