import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validatePassiveTreeSnapshot } from '../src/core/passive-data';

const filePath = path.join(process.cwd(), 'assets', 'game-data', 'passive-tree-3.29.json');
const raw = await fs.readFile(filePath, 'utf8');
const snapshot = validatePassiveTreeSnapshot(JSON.parse(raw) as unknown);
if (!snapshot) throw new Error('Passive tree snapshot failed schema validation.');
const sha256 = createHash('sha256').update(JSON.stringify(snapshot.nodes)).digest('hex');
if (sha256 !== snapshot.source.sha256) throw new Error(`Passive tree checksum mismatch: expected ${snapshot.source.sha256}, calculated ${sha256}.`);
if (snapshot.gameVersion !== '3.29') throw new Error(`Expected PoE 3.29 passive tree data, received ${snapshot.gameVersion}.`);
const namedMilestones = snapshot.nodes.filter((node) => node.kind === 'notable' || node.kind === 'keystone');
if (namedMilestones.length < 200) throw new Error(`Passive snapshot contains suspiciously few notable/keystone nodes (${namedMilestones.length}).`);
console.log(`Passive tree snapshot OK: ${snapshot.nodes.length} nodes, ${namedMilestones.length} notable/keystone targets, ${sha256.slice(0, 12)}.`);
