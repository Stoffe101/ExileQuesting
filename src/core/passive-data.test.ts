import { describe, expect, it } from 'vitest';
import { hasPassiveTreeGeometry, validatePassiveTreeSnapshot } from './passive-data';

function identityNodes(count = 1001) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, name: `Node ${index + 1}`, kind: 'normal' as const }));
}

function geometryNodes(count = 1001) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Node ${index + 1}`,
    kind: index === 0 ? 'class-start' as const : 'normal' as const,
    x: (index % 50) * 180 - 4500,
    y: Math.floor(index / 50) * 180 - 1800,
    group: index,
    orbit: 0,
    orbitIndex: 0,
    ...(index < count - 1 ? { out: [index + 2] } : {}),
    ...(index === 0 ? { classStartIndex: 2 } : {}),
  }));
}

function baseSnapshot(nodes: unknown[], schemaVersion: 1 | 2) {
  return {
    schemaVersion,
    gameVersion: '3.29',
    generatedAt: '2026-09-02T00:00:00.000Z',
    source: { url: 'https://www.pathofexile.com/passive-skill-tree', sha256: 'a'.repeat(64) },
    nodes,
    ...(schemaVersion === 2 ? {
      bounds: { minX: -5000, minY: -2500, maxX: 5000, maxY: 2500 },
      skillsPerOrbit: [1, 6, 12],
      orbitRadii: [0, 82, 162],
    } : {}),
  };
}

describe('passive tree snapshot validation', () => {
  it('keeps schema v1 identity-only snapshots readable for textual guidance', () => {
    const snapshot = validatePassiveTreeSnapshot(baseSnapshot(identityNodes(), 1));
    expect(snapshot?.schemaVersion).toBe(1);
    expect(snapshot?.nodes).toHaveLength(1001);
    expect(hasPassiveTreeGeometry(snapshot ?? undefined)).toBe(false);
  });

  it('accepts schema v2 when every static main-tree node has geometry', () => {
    const snapshot = validatePassiveTreeSnapshot(baseSnapshot(geometryNodes(), 2));
    expect(snapshot?.schemaVersion).toBe(2);
    expect(snapshot?.nodes[0].x).toBeTypeOf('number');
    expect(hasPassiveTreeGeometry(snapshot ?? undefined)).toBe(true);
  });

  it('accepts explicitly dynamic Cluster/mastery definitions without fixed coordinates', () => {
    const nodes = geometryNodes();
    nodes.push({ id: 60001, name: 'Martial Prowess', kind: 'notable', dynamic: true } as never);
    nodes.push({ id: 60002, name: 'Attack Damage Mastery', kind: 'mastery', dynamic: true } as never);
    const snapshot = validatePassiveTreeSnapshot(baseSnapshot(nodes, 2));
    expect(snapshot).not.toBeNull();
    expect(snapshot?.nodes.at(-1)?.dynamic).toBe(true);
  });

  it('rejects a static base-tree node that loses its geometry', () => {
    const nodes = geometryNodes();
    delete (nodes[500] as Partial<typeof nodes[number]>).x;
    delete (nodes[500] as Partial<typeof nodes[number]>).y;
    delete (nodes[500] as Partial<typeof nodes[number]>).group;
    delete (nodes[500] as Partial<typeof nodes[number]>).orbit;
    delete (nodes[500] as Partial<typeof nodes[number]>).orbitIndex;
    expect(validatePassiveTreeSnapshot(baseSnapshot(nodes, 2))).toBeNull();
  });

  it('rejects a dynamic definition that also claims a fixed position', () => {
    const nodes = geometryNodes();
    nodes.push({ id: 60003, name: 'Impossible Dynamic Node', kind: 'notable', dynamic: true, x: 1, y: 2, group: 5, orbit: 0, orbitIndex: 0 } as never);
    expect(validatePassiveTreeSnapshot(baseSnapshot(nodes, 2))).toBeNull();
  });

  it('rejects malformed graph edges and incomplete coordinate pairs', () => {
    const badEdge = geometryNodes();
    (badEdge[10] as { out?: unknown }).out = ['not-a-node'];
    expect(validatePassiveTreeSnapshot(baseSnapshot(badEdge, 2))).toBeNull();

    const badCoordinate = geometryNodes();
    delete (badCoordinate[11] as Partial<typeof badCoordinate[number]>).y;
    expect(validatePassiveTreeSnapshot(baseSnapshot(badCoordinate, 2))).toBeNull();
  });
});
