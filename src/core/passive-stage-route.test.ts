import { describe, expect, it } from 'vitest';
import { derivePassiveStageAllocationOrder } from './passive-stage-route';
import type { PassiveTreeSnapshot } from './passive-data';

const snapshot: PassiveTreeSnapshot = {
  schemaVersion: 2,
  gameVersion: '3.29',
  generatedAt: '2026-09-04T00:00:00.000Z',
  source: { url: 'test', sha256: '0'.repeat(64) },
  bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  skillsPerOrbit: [1], orbitRadii: [0],
  nodes: [
    { id: 1, name: 'WITCH', kind: 'class-start', classStartIndex: 3, x: 0, y: 0, group: 1, orbit: 0, orbitIndex: 0, out: [2, 5] },
    { id: 2, name: 'A', kind: 'normal', x: -100, y: -100, group: 2, orbit: 0, orbitIndex: 0, out: [3] },
    { id: 3, name: 'B', kind: 'normal', x: -200, y: -180, group: 3, orbit: 0, orbitIndex: 0, out: [4] },
    { id: 4, name: 'C', kind: 'notable', x: -280, y: -240, group: 4, orbit: 0, orbitIndex: 0, out: [] },
    { id: 5, name: 'D', kind: 'normal', x: 110, y: -90, group: 5, orbit: 0, orbitIndex: 0, out: [6] },
    { id: 6, name: 'E', kind: 'notable', x: 220, y: -170, group: 6, orbit: 0, orbitIndex: 0, out: [] },
    { id: 10, name: 'Asc Root', kind: 'ascendancy', ascendancyName: 'Occultist', ascendancyStart: true, x: 0, y: 500, group: 10, orbit: 0, orbitIndex: 0, out: [11] },
    { id: 11, name: 'Asc A', kind: 'ascendancy', ascendancyName: 'Occultist', x: 100, y: 500, group: 11, orbit: 0, orbitIndex: 0, out: [12] },
    { id: 12, name: 'Asc B', kind: 'ascendancy', ascendancyName: 'Occultist', x: 200, y: 500, group: 12, orbit: 0, orbitIndex: 0, out: [] },
  ],
};

describe('derived PoB passive stage route', () => {
  it('returns a click-valid connected order for a pure expansion', () => {
    const route = derivePassiveStageAllocationOrder(snapshot, [1], [1, 2, 3, 4, 5, 6], 1);
    expect(route).toBeDefined();
    expect(new Set(route!.nodeIds)).toEqual(new Set([2, 3, 4, 5, 6]));
    const allocated = new Set([1]);
    const edges = new Map<number, number[]>([
      [2, [1, 3]], [3, [2, 4]], [4, [3]], [5, [1, 6]], [6, [5]],
    ]);
    for (const id of route!.nodeIds) {
      expect((edges.get(id) ?? []).some((neighbour) => allocated.has(neighbour))).toBe(true);
      allocated.add(id);
    }
    expect(route!.hadBranchChoice).toBe(true);
  });

  it('continues deterministically along the nearby branch after the first choice', () => {
    const first = derivePassiveStageAllocationOrder(snapshot, [1], [1, 2, 3, 4, 5, 6], 1)!;
    const second = derivePassiveStageAllocationOrder(snapshot, [1], [1, 2, 3, 4, 5, 6], 1)!;
    expect(first.nodeIds).toEqual(second.nodeIds);
  });

  it('refuses a stage containing refunds/repathing', () => {
    expect(derivePassiveStageAllocationOrder(snapshot, [1, 2, 3], [1, 5, 6], 1)).toBeUndefined();
  });

  it('refuses disconnected additions instead of inventing a teleport', () => {
    expect(derivePassiveStageAllocationOrder(snapshot, [1], [1, 4], 1)).toBeUndefined();
  });

  it('uses the fixed Ascendancy root as a non-click connectivity seed', () => {
    const route = derivePassiveStageAllocationOrder(snapshot, [], [10, 11, 12]);
    expect(route?.nodeIds).toEqual([11, 12]);
  });
});
