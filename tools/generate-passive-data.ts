import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PassiveNodeKind, PassiveNodeRecord, PassiveTreeSnapshot } from '../src/core/passive-data';

const GAME_VERSION = '3.29';
const SOURCE_URL = 'https://www.pathofexile.com/passive-skill-tree';
const OUTPUT = path.join(process.cwd(), 'assets', 'game-data', 'passive-tree-3.29.json');

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
  const nodes: PassiveNodeRecord[] = [];
  for (const [key, raw] of Object.entries(rawNodes)) {
    const node = record(raw);
    const id = Number(node.skill ?? key);
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    nodes.push({ id, name, kind: nodeKind(node) });
  }
  nodes.sort((left, right) => left.id - right.id);
  if (nodes.length < 1000) throw new Error(`Only ${nodes.length} passive nodes were extracted.`);
  const normalizedPayload = JSON.stringify(nodes);
  const sha256 = createHash('sha256').update(normalizedPayload).digest('hex');
  const snapshot: PassiveTreeSnapshot = {
    schemaVersion: 1,
    gameVersion: GAME_VERSION,
    generatedAt: await existingGeneratedAt(sha256) ?? new Date().toISOString(),
    source: { url: SOURCE_URL, sha256 },
    nodes,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Generated ${OUTPUT} with ${nodes.length} nodes (${sha256.slice(0, 12)}).`);
}

await main();
