import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { passiveAscendancyStarts, validatePassiveTreeSnapshot } from '../src/core/passive-data';
import { assertPobPassiveReference, POB_PASSIVE_REFERENCE } from '../src/core/pob-passive-reference';

const filePath = path.join(process.cwd(), 'assets', 'game-data', 'passive-tree-3.29.json');
const raw = await fs.readFile(filePath, 'utf8');
const snapshot = validatePassiveTreeSnapshot(JSON.parse(raw) as unknown);
if (!snapshot) throw new Error('Passive tree snapshot failed schema validation.');
const sha256 = createHash('sha256').update(JSON.stringify(snapshot.nodes)).digest('hex');
if (sha256 !== snapshot.source.sha256) throw new Error(`Passive tree checksum mismatch: expected ${snapshot.source.sha256}, calculated ${sha256}.`);
if (snapshot.gameVersion !== '3.29') throw new Error(`Expected PoE 3.29 passive tree data, received ${snapshot.gameVersion}.`);
assertPobPassiveReference(snapshot);
const namedMilestones = snapshot.nodes.filter((node) => node.kind === 'notable' || node.kind === 'keystone');
if (namedMilestones.length < 200) throw new Error(`Passive snapshot contains suspiciously few notable/keystone nodes (${namedMilestones.length}).`);
const ascendancyNodes = snapshot.nodes.filter((node) => node.kind === 'ascendancy');
const ascendancyStarts = passiveAscendancyStarts(snapshot);
if (ascendancyNodes.length < 300 || ascendancyStarts.length < 18) {
  throw new Error(`Passive snapshot contains suspiciously little Ascendancy geometry (${ascendancyNodes.length} nodes, ${ascendancyStarts.length} roots).`);
}
if (ascendancyNodes.some((node) => !node.ascendancyName || node.x === undefined || node.y === undefined)) {
  throw new Error('At least one bundled Ascendancy node is missing fixed local geometry or scope identity.');
}
console.log(`Passive tree snapshot OK against Path of Building ${POB_PASSIVE_REFERENCE.treeVersion}@${POB_PASSIVE_REFERENCE.commit.slice(0, 12)}: ${snapshot.nodes.length} nodes, ${namedMilestones.length} notable/keystone targets, ${ascendancyNodes.length} Ascendancy nodes across ${ascendancyStarts.length} scopes, ${sha256.slice(0, 12)}.`);
