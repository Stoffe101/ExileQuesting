import { describe, expect, it } from 'vitest';
import { POE_BASE_CLASSES, passiveClassStart, passiveClassStarts, type PassiveNodeRecord, type PassiveTreeSnapshot } from './passive-data';
import { selectPassiveHudAnchors } from './passive-tree-hud';

function classSnapshot(): PassiveTreeSnapshot {
  const nodes: PassiveNodeRecord[] = [];
  POE_BASE_CLASSES.forEach((className, classIndex) => {
    const angle = classIndex * (Math.PI * 2 / POE_BASE_CLASSES.length);
    const startId = 10_000 + classIndex * 100;
    const startX = Math.cos(angle) * 5000;
    const startY = Math.sin(angle) * 5000;
    const pathIds = [startId + 1, startId + 2, startId + 3, startId + 4];
    nodes.push({
      id: startId,
      name: className.toUpperCase(),
      kind: 'class-start',
      classStartIndex: classIndex,
      x: startX,
      y: startY,
      group: 100 + classIndex,
      orbit: 0,
      orbitIndex: 0,
      out: [pathIds[0]],
    });
    pathIds.forEach((id, index) => nodes.push({
      id,
      name: `${className} Path ${index + 1}`,
      kind: 'normal',
      x: startX + Math.cos(angle) * (160 * (index + 1)) + Math.sin(angle) * (60 * (index % 2)),
      y: startY + Math.sin(angle) * (160 * (index + 1)) - Math.cos(angle) * (60 * (index % 2)),
      group: 200 + classIndex * 10 + index,
      orbit: 0,
      orbitIndex: 0,
      out: index < pathIds.length - 1 ? [pathIds[index + 1]] : [],
    }));
  });
  return {
    schemaVersion: 2,
    gameVersion: '3.29',
    generatedAt: '2026-09-02T00:00:00.000Z',
    source: { url: 'test', sha256: '0'.repeat(64) },
    bounds: { minX: -7000, minY: -7000, maxX: 7000, maxY: 7000 },
    skillsPerOrbit: [1],
    orbitRadii: [0],
    nodes,
  };
}

describe('base-class passive starts', () => {
  const snapshot = classSnapshot();

  it('resolves exactly seven unique base-class starts from data', () => {
    const starts = passiveClassStarts(snapshot);
    expect(starts).toHaveLength(7);
    expect(new Set(starts.map((node) => node.id)).size).toBe(7);
    expect(new Set(starts.map((node) => node.classStartIndex)).size).toBe(7);
  });

  it.each(POE_BASE_CLASSES)('uses the correct %s start node as a registration anchor', (className) => {
    const start = passiveClassStart(snapshot, { className });
    expect(start).toBeDefined();
    const operations = [1, 2, 3, 4].map((offset) => ({ nodeId: start!.id + offset }));
    const anchors = selectPassiveHudAnchors(snapshot, operations, 0, { className, maxAnchors: 12 });
    expect(anchors.some((anchor) => anchor.id === start!.id)).toBe(true);
    const otherStarts = passiveClassStarts(snapshot).filter((node) => node.id !== start!.id);
    expect(anchors.some((anchor) => otherStarts.some((node) => node.id === anchor.id))).toBe(false);
  });

  it('also resolves a class by PoB/GGG class index when a friendly name is unavailable', () => {
    for (const start of passiveClassStarts(snapshot)) {
      expect(passiveClassStart(snapshot, { classId: start.classStartIndex })?.id).toBe(start.id);
    }
  });
});
