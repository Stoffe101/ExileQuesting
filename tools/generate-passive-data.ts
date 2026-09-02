import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PassiveNodeKind, PassiveNodeRecord, PassiveTreeBounds, PassiveTreeSnapshot } from '../src/core/passive-data';

const GAME_VERSION = '3.29';
const SOURCE_URL = 'https://www.pathofexile.com/passive-skill-tree';
const OUTPUT = path.join(process.cwd(), 'assets', 'game-data', 'passive-tree-3.29.json');
const SIXTEEN_ORBIT_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const FORTY_ORBIT_ANGLES = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350];

function extractAssignedObject(source: string, marker: string): unknown {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not find ${marker} in passive tree response.`);
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error(`Could not find object start after ${marker}.`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1)) as unknown;
    }
  }
  throw new Error(`Could not find object end after ${marker}.`);
}

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

function numberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((candidate) => Number.isFinite(candidate));
}

function orbitAngleRadians(skillsOnOrbit: number, orbitIndex: number): number {
  const degrees = skillsOnOrbit === 16
    ? SIXTEEN_ORBIT_ANGLES[orbitIndex]
    : skillsOnOrbit === 40
      ? FORTY_ORBIT_ANGLES[orbitIndex]
      : skillsOnOrbit > 0 ? orbitIndex * (360 / skillsOnOrbit) : undefined;
  if (degrees === undefined) throw new Error(`Invalid orbit index ${orbitIndex} for orbit with ${skillsOnOrbit} slots.`);
  return degrees * Math.PI / 180;
}

function nodePosition(node: Record<string, unknown>, groups: Record<string, unknown>, skillsPerOrbit: number[], orbitRadii: number[]): { x: number; y: number } | undefined {
  const groupId = Number(node.group);
  const orbit = Number(node.orbit);
  const orbitIndex = Number(node.orbitIndex);
  if (!Number.isInteger(groupId) || !Number.isInteger(orbit) || !Number.isInteger(orbitIndex)) return undefined;
  const group = record(groups[String(groupId)]);
  const groupX = Number(group.x);
  const groupY = Number(group.y);
  const radius = orbitRadii[orbit];
  const skillsOnOrbit = skillsPerOrbit[orbit];
  if (![groupX, groupY, radius, skillsOnOrbit].every(Number.isFinite) || !skillsOnOrbit) return undefined;
  const angle = orbitAngleRadians(skillsOnOrbit, orbitIndex);
  return {
    x: groupX + Math.sin(angle) * radius,
    y: groupY - Math.cos(angle) * radius,
  };
}

function treeBounds(tree: Record<string, unknown>, nodes: PassiveNodeRecord[]): PassiveTreeBounds {
  const minX = Number(tree.min_x);
  const minY = Number(tree.min_y);
  const maxX = Number(tree.max_x);
  const maxY = Number(tree.max_y);
  if ([minX, minY, maxX, maxY].every(Number.isFinite) && minX < maxX && minY < maxY) return { minX, minY, maxX, maxY };
  const positioned = nodes.filter((node) => node.x !== undefined && node.y !== undefined);
  if (!positioned.length) throw new Error('Passive tree contained no usable geometry.');
  return {
    minX: Math.min(...positioned.map((node) => node.x!)),
    minY: Math.min(...positioned.map((node) => node.y!)),
    maxX: Math.max(...positioned.map((node) => node.x!)),
    maxY: Math.max(...positioned.map((node) => node.y!)),
  };
}

async function existingGeneratedAt(sha256: string): Promise<string | undefined> {
  try {
    const existing = JSON.parse(await fs.readFile(OUTPUT, 'utf8')) as Partial<PassiveTreeSnapshot>;
    if (existing.source?.sha256 === sha256 && existing.gameVersion === GAME_VERSION && typeof existing.generatedAt === 'string') return existing.generatedAt;
  } catch { /* first generation or invalid old snapshot */ }
  return undefined;
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'ExileQuesting passive-data generator (github.com/Stoffe101/ExileQuesting)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Passive tree endpoint returned HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length < 100_000 || html.length > 20_000_000) throw new Error(`Passive tree response had suspicious size ${html.length}.`);
  const tree = record(extractAssignedObject(html, 'var passiveSkillTreeData'));
  const rawNodes = record(tree.nodes);
  const groups = record(tree.groups);
  const constants = record(tree.constants);
  const skillsPerOrbit = numberArray(constants.skillsPerOrbit).map(Math.trunc);
  const orbitRadii = numberArray(constants.orbitRadii);
  if (!skillsPerOrbit.length || skillsPerOrbit.length !== orbitRadii.length) throw new Error('Passive tree orbit constants were missing or inconsistent.');

  const nodes: PassiveNodeRecord[] = [];
  for (const [key, raw] of Object.entries(rawNodes)) {
    const node = record(raw);
    const id = Number(node.skill ?? key);
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    const kind = nodeKind(node);
    const position = nodePosition(node, groups, skillsPerOrbit, orbitRadii);
    const group = Number(node.group);
    const orbit = Number(node.orbit);
    const orbitIndex = Number(node.orbitIndex);
    const classStartIndex = Number(node.classStartIndex);
    const out = Array.isArray(node.out) ? node.out.map(Number).filter((candidate) => Number.isSafeInteger(candidate) && candidate > 0) : [];
    const icon = typeof node.icon === 'string' ? node.icon : undefined;
    nodes.push({
      id,
      name,
      kind,
      ...(position ?? {}),
      ...(Number.isSafeInteger(group) ? { group } : {}),
      ...(Number.isSafeInteger(orbit) ? { orbit } : {}),
      ...(Number.isSafeInteger(orbitIndex) ? { orbitIndex } : {}),
      ...(out.length ? { out } : {}),
      ...(Number.isSafeInteger(classStartIndex) && classStartIndex >= 0 ? { classStartIndex } : {}),
      ...(icon ? { icon } : {}),
    });
  }
  nodes.sort((left, right) => left.id - right.id);
  if (nodes.length < 1000) throw new Error(`Only ${nodes.length} passive nodes were extracted.`);
  const mainTree = nodes.filter((node) => node.kind !== 'ascendancy');
  const mainTreeGeometry = mainTree.filter((node) => node.x !== undefined && node.y !== undefined);
  if (mainTreeGeometry.length < Math.floor(mainTree.length * 0.98)) throw new Error(`Only ${mainTreeGeometry.length}/${mainTree.length} main-tree passive nodes had geometry.`);

  const normalizedPayload = JSON.stringify(nodes);
  const sha256 = createHash('sha256').update(normalizedPayload).digest('hex');
  const snapshot: PassiveTreeSnapshot = {
    schemaVersion: 2,
    gameVersion: GAME_VERSION,
    generatedAt: await existingGeneratedAt(sha256) ?? new Date().toISOString(),
    source: { url: SOURCE_URL, sha256 },
    nodes,
    bounds: treeBounds(tree, nodes),
    skillsPerOrbit,
    orbitRadii,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Generated ${OUTPUT} with ${nodes.length} nodes; ${mainTreeGeometry.length}/${mainTree.length} main-tree nodes positioned (${sha256.slice(0, 12)}).`);
}

await main();
