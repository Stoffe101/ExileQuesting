export type PassiveNodeKind = 'normal' | 'notable' | 'keystone' | 'mastery' | 'socket' | 'class-start' | 'ascendancy';

export interface PassiveNodeRecord {
  id: number;
  name: string;
  kind: PassiveNodeKind;
}

export interface PassiveTreeSnapshot {
  schemaVersion: 1;
  gameVersion: string;
  generatedAt: string;
  source: {
    url: string;
    sha256: string;
  };
  nodes: PassiveNodeRecord[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function kind(value: unknown): PassiveNodeKind | null {
  return ['normal', 'notable', 'keystone', 'mastery', 'socket', 'class-start', 'ascendancy'].includes(String(value))
    ? value as PassiveNodeKind
    : null;
}

export function validatePassiveTreeSnapshot(value: unknown): PassiveTreeSnapshot | null {
  const source = record(value);
  const sourceInfo = record(source?.source);
  if (!source || source.schemaVersion !== 1 || typeof source.gameVersion !== 'string' || typeof source.generatedAt !== 'string') return null;
  if (!sourceInfo || typeof sourceInfo.url !== 'string' || typeof sourceInfo.sha256 !== 'string') return null;
  if (!Array.isArray(source.nodes) || source.nodes.length < 1000 || source.nodes.length > 5000) return null;
  const nodes: PassiveNodeRecord[] = [];
  const ids = new Set<number>();
  for (const candidate of source.nodes) {
    const node = record(candidate);
    const nodeKind = kind(node?.kind);
    if (!node || !Number.isSafeInteger(node.id) || Number(node.id) <= 0 || typeof node.name !== 'string' || !node.name.trim() || !nodeKind) return null;
    const id = Number(node.id);
    if (ids.has(id)) return null;
    ids.add(id);
    nodes.push({ id, name: node.name.trim().slice(0, 160), kind: nodeKind });
  }
  return {
    schemaVersion: 1,
    gameVersion: source.gameVersion,
    generatedAt: source.generatedAt,
    source: { url: sourceInfo.url, sha256: sourceInfo.sha256 },
    nodes,
  };
}

export function indexPassiveNodes(snapshot: PassiveTreeSnapshot): Map<number, PassiveNodeRecord> {
  return new Map(snapshot.nodes.map((node) => [node.id, node]));
}
