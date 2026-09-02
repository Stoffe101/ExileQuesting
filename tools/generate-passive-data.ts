import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PassiveNodeKind, PassiveNodeRecord, PassiveTreeBounds, PassiveTreeSnapshot } from '../src/core/passive-data';

const GAME_VERSION = '3.29';
const SOURCE_REPOSITORY = 'grindinggear/skilltree-export';
const SOURCE_COMMIT = '8bd138b32ea2631455cac5935bfab089f826094f'; // GGG 3.29.1 export
const SOURCE_PATH = 'data.json';
const SOURCE_RAW_URL = `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${SOURCE_COMMIT}/${SOURCE_PATH}`;
const OUTPUT = path.join(process.cwd(), 'assets', 'game-data', 'passive-tree-3.29.json');
const SIXTEEN_ORBIT_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const FORTY_ORBIT_ANGLES = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function nodeKind(node: Record<string, unknown>): PassiveNodeKind {
  if (node.isAscendancyStart || typeof node.ascendancyName === 'string') return 'ascendancy';
  if (node.classStartIndex !== undefined) return 'class-start';
  if (node.isKeystone) return 'keystone';
  if (node.isNotable) return 'notable';
  if (node.isMastery) return 'mastery';
  if (node.isJewelSocket) return 'socket';
  return 'normal';
}
function numberArray(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter((candidate) => Number.isFinite(candidate)) : []; }
function orbitAngleRadians(skillsOnOrbit: number, orbitIndex: number): number {
  const degrees = skillsOnOrbit === 16 ? SIXTEEN_ORBIT_ANGLES[orbitIndex] : skillsOnOrbit === 40 ? FORTY_ORBIT_ANGLES[orbitIndex] : skillsOnOrbit > 0 ? orbitIndex * (360 / skillsOnOrbit) : undefined;
  if (degrees === undefined) throw new Error(`Invalid orbit index ${orbitIndex} for orbit with ${skillsOnOrbit} slots.`);
  return degrees * Math.PI / 180;
}
function nodePosition(node: Record<string, unknown>, groups: Record<string, unknown>, skillsPerOrbit: number[], orbitRadii: number[]): { x: number; y: number } | undefined {
  const groupId = Number(node.group); const orbit = Number(node.orbit); const orbitIndex = Number(node.orbitIndex);
  if (!Number.isInteger(groupId) || !Number.isInteger(orbit) || !Number.isInteger(orbitIndex)) return undefined;
  const group = record(groups[String(groupId)]); const groupX = Number(group.x); const groupY = Number(group.y); const radius = orbitRadii[orbit]; const skillsOnOrbit = skillsPerOrbit[orbit];
  if (![groupX, groupY, radius, skillsOnOrbit].every(Number.isFinite) || !skillsOnOrbit) return undefined;
  const angle = orbitAngleRadians(skillsOnOrbit, orbitIndex);
  return { x: groupX + Math.sin(angle) * radius, y: groupY - Math.cos(angle) * radius };
}
function treeBounds(tree: Record<string, unknown>, nodes: PassiveNodeRecord[]): PassiveTreeBounds {
  const minX = Number(tree.min_x); const minY = Number(tree.min_y); const maxX = Number(tree.max_x); const maxY = Number(tree.max_y);
  if ([minX, minY, maxX, maxY].every(Number.isFinite) && minX < maxX && minY < maxY) return { minX, minY, maxX, maxY };
  const positioned = nodes.filter((node) => node.kind !== 'ascendancy' && node.x !== undefined && node.y !== undefined);
  if (!positioned.length) throw new Error('Passive tree contained no usable base-tree geometry.');
  return { minX: Math.min(...positioned.map((node) => node.x!)), minY: Math.min(...positioned.map((node) => node.y!)), maxX: Math.max(...positioned.map((node) => node.x!)), maxY: Math.max(...positioned.map((node) => node.y!)) };
}
async function existingGeneratedAt(sha256: string): Promise<string | undefined> {
  try {
    const existing = JSON.parse(await fs.readFile(OUTPUT, 'utf8')) as Partial<PassiveTreeSnapshot>;
    if (existing.source?.sha256 === sha256 && existing.gameVersion === GAME_VERSION && typeof existing.generatedAt === 'string') return existing.generatedAt;
  } catch { /* first generation or invalid old snapshot */ }
  return undefined;
}
function canonicalClassNames(tree: Record<string, unknown>): Map<number, string> {
  if (!Array.isArray(tree.classes)) throw new Error('Passive tree did not expose its class table.');
  const names = new Map<number, string>();
  for (let index = 0; index < tree.classes.length; index += 1) { const entry = record(tree.classes[index]); const name = typeof entry.name === 'string' ? entry.name.trim() : ''; if (name) names.set(index, name); }
  if (names.size !== 7) throw new Error(`Expected seven base classes, found ${names.size}.`);
  return names;
}

async function fetchPinnedTree(): Promise<Record<string, unknown>> {
  const response = await fetch(SOURCE_RAW_URL, {
    headers: { 'User-Agent': 'ExileQuesting passive-data generator (github.com/Stoffe101/ExileQuesting)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GGG skilltree-export returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length < 1_000_000 || text.length > 10_000_000) throw new Error(`GGG skilltree-export had suspicious size ${text.length}.`);
  const parsed = JSON.parse(text) as unknown;
  const tree = record(parsed);
  if (!Object.keys(tree).length) throw new Error('GGG skilltree-export data.json did not contain a tree object.');
  return tree;
}

async function main() {
  const tree = await fetchPinnedTree();
  const rawNodes = record(tree.nodes); const groups = record(tree.groups); const constants = record(tree.constants);
  const skillsPerOrbit = numberArray(constants.skillsPerOrbit).map(Math.trunc); const orbitRadii = numberArray(constants.orbitRadii); const classNames = canonicalClassNames(tree);
  if (!skillsPerOrbit.length || skillsPerOrbit.length !== orbitRadii.length) throw new Error('Passive tree orbit constants were missing or inconsistent.');

  const nodes: PassiveNodeRecord[] = [];
  for (const [key, raw] of Object.entries(rawNodes)) {
    const node = record(raw); const id = Number(node.skill ?? key); const kind = nodeKind(node); const classStartIndex = Number(node.classStartIndex);
    const rawName = typeof node.name === 'string' ? node.name.trim() : '';
    const name = kind === 'class-start' && Number.isSafeInteger(classStartIndex) ? classNames.get(classStartIndex) ?? rawName : rawName;
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    const position = nodePosition(node, groups, skillsPerOrbit, orbitRadii);
    const hasNoPlacementFields = node.group === undefined && node.orbit === undefined && node.orbitIndex === undefined;
    const dynamic = kind !== 'ascendancy' && !position && hasNoPlacementFields;
    if (kind !== 'ascendancy' && !position && !dynamic) throw new Error(`Static passive ${id} (${name}) had incomplete or invalid group/orbit geometry.`);
    if (kind === 'ascendancy' && !position) throw new Error(`Ascendancy passive ${id} (${name}) had incomplete or invalid local group/orbit geometry.`);
    const group = Number(node.group); const orbit = Number(node.orbit); const orbitIndex = Number(node.orbitIndex);
    const out = Array.isArray(node.out) ? node.out.map(Number).filter((candidate) => Number.isSafeInteger(candidate) && candidate > 0) : [];
    const ascendancyName = typeof node.ascendancyName === 'string' ? node.ascendancyName.trim() : undefined;
    const ascendancyStart = node.isAscendancyStart === true; const icon = typeof node.icon === 'string' ? node.icon : undefined;
    nodes.push({ id, name, kind, ...(dynamic ? { dynamic: true } : {}), ...(position ?? {}), ...(Number.isSafeInteger(group) ? { group } : {}), ...(Number.isSafeInteger(orbit) ? { orbit } : {}), ...(Number.isSafeInteger(orbitIndex) ? { orbitIndex } : {}), ...(out.length ? { out } : {}), ...(Number.isSafeInteger(classStartIndex) && classStartIndex >= 0 ? { classStartIndex } : {}), ...(ascendancyName ? { ascendancyName } : {}), ...(ascendancyStart ? { ascendancyStart: true } : {}), ...(icon ? { icon } : {}) });
  }
  nodes.sort((left, right) => left.id - right.id);
  if (nodes.length < 1000) throw new Error(`Only ${nodes.length} passive nodes were extracted.`);
  const staticMainTree = nodes.filter((node) => node.kind !== 'ascendancy' && !node.dynamic); const staticMainTreeGeometry = staticMainTree.filter((node) => node.x !== undefined && node.y !== undefined);
  if (staticMainTreeGeometry.length !== staticMainTree.length) throw new Error(`Only ${staticMainTreeGeometry.length}/${staticMainTree.length} static main-tree passive nodes had geometry.`);
  const classStarts = nodes.filter((node) => node.kind === 'class-start'); if (classStarts.length !== classNames.size) throw new Error(`Expected ${classNames.size} class starts, extracted ${classStarts.length}.`);
  const dynamicCount = nodes.filter((node) => node.dynamic).length;
  const ascendancyNodes = nodes.filter((node) => node.kind === 'ascendancy'); const ascendancyNames = new Map<string, { nodes: number; starts: number }>();
  for (const node of ascendancyNodes) {
    if (!node.ascendancyName || node.x === undefined || node.y === undefined) throw new Error(`Ascendancy node ${node.id} is missing local scope geometry.`);
    const entry = ascendancyNames.get(node.ascendancyName) ?? { nodes: 0, starts: 0 }; entry.nodes += 1; if (node.ascendancyStart) entry.starts += 1; ascendancyNames.set(node.ascendancyName, entry);
  }
  if (ascendancyNodes.length < 300 || ascendancyNames.size < 18) throw new Error(`Passive tree exposed suspiciously little Ascendancy data (${ascendancyNodes.length} nodes, ${ascendancyNames.size} scopes).`);
  for (const [ascendancyName, entry] of ascendancyNames) if (entry.starts !== 1 || entry.nodes < 2) throw new Error(`${ascendancyName} exposed ${entry.nodes} nodes and ${entry.starts} start nodes.`);

  const normalizedPayload = JSON.stringify(nodes); const sha256 = createHash('sha256').update(normalizedPayload).digest('hex');
  const snapshot: PassiveTreeSnapshot = {
    schemaVersion: 2, gameVersion: GAME_VERSION, generatedAt: await existingGeneratedAt(sha256) ?? new Date().toISOString(),
    source: { url: SOURCE_RAW_URL, sha256, repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, path: SOURCE_PATH },
    nodes, bounds: treeBounds(tree, nodes), skillsPerOrbit, orbitRadii,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Generated ${OUTPUT} from ${SOURCE_REPOSITORY}@${SOURCE_COMMIT.slice(0, 12)} with ${nodes.length} nodes; ${staticMainTree.length} static main-tree nodes positioned; ${dynamicCount} dynamic definitions; ${classStarts.length} canonical class starts; ${ascendancyNodes.length} Ascendancy nodes across ${ascendancyNames.size} local scopes (${sha256.slice(0, 12)}).`);
}

await main();
