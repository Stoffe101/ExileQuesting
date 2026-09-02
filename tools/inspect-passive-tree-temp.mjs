const SOURCE_URL = 'https://www.pathofexile.com/passive-skill-tree';

function extractAssignedObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing ${marker}`);
  const start = source.indexOf('{', markerIndex + marker.length);
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error('Unterminated object');
}

const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'ExileQuesting passive tree research' } });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const html = await response.text();
const tree = extractAssignedObject(html, 'var passiveSkillTreeData');
const nodes = Object.values(tree.nodes ?? {});
const ranger = nodes.find((node) => node.classStartIndex === 2 || node.classStartIndex === 3) ?? nodes.find((node) => node.classStartIndex !== undefined);
const ordinary = nodes.find((node) => node.group !== undefined && node.orbit !== undefined && node.orbitIndex !== undefined && Array.isArray(node.out));
console.log(JSON.stringify({
  treeKeys: Object.keys(tree),
  constantsKeys: Object.keys(tree.constants ?? {}),
  orbitRadii: tree.constants?.orbitRadii,
  orbitAngles: tree.constants?.orbitAngles,
  groupsCount: Object.keys(tree.groups ?? {}).length,
  groupSample: Object.entries(tree.groups ?? {}).slice(0, 2),
  nodeCount: nodes.length,
  nodeSample: ordinary,
  classStartSample: ranger,
  root: tree.root,
  minX: tree.min_x,
  maxX: tree.max_x,
  minY: tree.min_y,
  maxY: tree.max_y,
}, null, 2));
