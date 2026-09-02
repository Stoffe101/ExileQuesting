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

function kind(node) {
  if (node.isAscendancyStart || typeof node.ascendancyName === 'string') return 'ascendancy';
  if (node.classStartIndex !== undefined) return 'class-start';
  if (node.isKeystone) return 'keystone';
  if (node.isNotable) return 'notable';
  if (node.isMastery) return 'mastery';
  if (node.isJewelSocket) return 'socket';
  return 'normal';
}

const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'ExileQuesting passive tree research' } });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const tree = extractAssignedObject(await response.text(), 'var passiveSkillTreeData');
const nodes = Object.values(tree.nodes ?? {});
const groups = tree.groups ?? {};
const missing = nodes.filter((node) => {
  const group = groups[String(node.group)];
  return node.name && (!group || !Number.isInteger(Number(node.orbit)) || !Number.isInteger(Number(node.orbitIndex)));
});
const classStarts = nodes.filter((node) => node.classStartIndex !== undefined);
const byKind = {};
const flags = {};
for (const node of missing) {
  const nodeKind = kind(node);
  byKind[nodeKind] = (byKind[nodeKind] ?? 0) + 1;
  for (const key of ['isProxy','isMastery','isBlighted','isMultipleChoice','isMultipleChoiceOption','isJewelSocket','isKeystone','isNotable','isAscendancyStart']) {
    if (node[key]) flags[key] = (flags[key] ?? 0) + 1;
  }
  if (!groups[String(node.group)]) flags.missingGroup = (flags.missingGroup ?? 0) + 1;
  if (!Number.isInteger(Number(node.orbit))) flags.missingOrbit = (flags.missingOrbit ?? 0) + 1;
  if (!Number.isInteger(Number(node.orbitIndex))) flags.missingOrbitIndex = (flags.missingOrbitIndex ?? 0) + 1;
}
console.log(JSON.stringify({
  namedNodes: nodes.filter((node) => node.name).length,
  classStarts: classStarts.map((node) => ({
    skill: node.skill,
    name: node.name,
    classStartIndex: node.classStartIndex,
    group: node.group,
    orbit: node.orbit,
    orbitIndex: node.orbitIndex,
    out: node.out,
  })),
  classes: tree.classes,
  constantsClasses: tree.constants?.classes,
  missingGeometry: missing.length,
  byKind,
  flags,
  samples: missing.slice(0, 30).map((node) => ({
    skill: node.skill,
    name: node.name,
    kind: kind(node),
    group: node.group,
    orbit: node.orbit,
    orbitIndex: node.orbitIndex,
    ascendancyName: node.ascendancyName,
    keys: Object.keys(node),
  })),
}, null, 2));
