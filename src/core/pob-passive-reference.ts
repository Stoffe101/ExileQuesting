import type { PassiveNodeRecord, PassiveTreeSnapshot } from './passive-data';

/**
 * Canonical PoE 1 passive-tree layout reference pinned to Path of Building
 * Community's current 3.29 tree. GGG remains ExileQuesting's raw-data source,
 * but generated geometry must agree with PoB's interpretation before it is
 * trusted by the HUD.
 */
export const POB_PASSIVE_REFERENCE = {
  repository: 'PathOfBuildingCommunity/PathOfBuilding',
  commit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
  treeVersion: '3_29',
  treePath: 'src/TreeData/3_29/tree.lua',
  treeBlobSha: '3086d40c72d926484c7d52b563ad686a5627a12a',
  gameVersion: '3.29',
  bounds: { minX: -14159, minY: -10689, maxX: 12430, maxY: 10900 },
  skillsPerOrbit: [1, 6, 16, 16, 40, 72, 72],
  orbitRadii: [0, 82, 162, 335, 493, 662, 846],
  classStarts: [
    { className: 'Scion', classStartIndex: 0, nodeId: 58833 },
    { className: 'Marauder', classStartIndex: 1, nodeId: 47175 },
    { className: 'Ranger', classStartIndex: 2, nodeId: 50459 },
    { className: 'Witch', classStartIndex: 3, nodeId: 54447 },
    { className: 'Duelist', classStartIndex: 4, nodeId: 50986 },
    { className: 'Templar', classStartIndex: 5, nodeId: 61525 },
    { className: 'Shadow', classStartIndex: 6, nodeId: 44683 },
  ],
  /** Concrete regression anchor from the user's v0.2.4 failure video. */
  witchFirstNode: {
    nodeId: 57264,
    name: 'Spell Damage and Mana',
    group: 434,
    orbit: 3,
    orbitIndex: 15,
    classStartNodeId: 54447,
  },
} as const;

function sameNumberArray(actual: number[] | undefined, expected: readonly number[]): boolean {
  return Boolean(actual && actual.length === expected.length && actual.every((value, index) => value === expected[index]));
}

function nodeById(snapshot: PassiveTreeSnapshot, nodeId: number): PassiveNodeRecord | undefined {
  return snapshot.nodes.find((node) => node.id === nodeId);
}

function close(actual: number | undefined, expected: number, tolerance = 1e-6): boolean {
  return actual !== undefined && Math.abs(actual - expected) <= tolerance;
}

/**
 * Validate the bundled/generated ExileQuesting snapshot against PoB's 3.29
 * interpretation. This intentionally checks stable identity/layout invariants,
 * not artwork or PoB UI implementation details.
 */
export function pobPassiveReferenceErrors(snapshot: PassiveTreeSnapshot): string[] {
  const errors: string[] = [];
  if (snapshot.gameVersion !== POB_PASSIVE_REFERENCE.gameVersion) {
    errors.push(`PoB reference is ${POB_PASSIVE_REFERENCE.gameVersion}, snapshot is ${snapshot.gameVersion}.`);
    return errors;
  }

  if (!sameNumberArray(snapshot.skillsPerOrbit, POB_PASSIVE_REFERENCE.skillsPerOrbit)) {
    errors.push('skillsPerOrbit differs from Path of Building 3.29.');
  }
  if (!sameNumberArray(snapshot.orbitRadii, POB_PASSIVE_REFERENCE.orbitRadii)) {
    errors.push('orbitRadii differs from Path of Building 3.29.');
  }

  const bounds = snapshot.bounds;
  const expectedBounds = POB_PASSIVE_REFERENCE.bounds;
  if (!bounds
    || !close(bounds.minX, expectedBounds.minX)
    || !close(bounds.minY, expectedBounds.minY)
    || !close(bounds.maxX, expectedBounds.maxX)
    || !close(bounds.maxY, expectedBounds.maxY)) {
    errors.push('base-tree bounds differ from Path of Building 3.29.');
  }

  for (const expected of POB_PASSIVE_REFERENCE.classStarts) {
    const node = nodeById(snapshot, expected.nodeId);
    if (!node) {
      errors.push(`${expected.className} PoB class start ${expected.nodeId} is missing.`);
      continue;
    }
    if (node.kind !== 'class-start') errors.push(`${expected.className} node ${expected.nodeId} is not marked class-start.`);
    if (node.classStartIndex !== expected.classStartIndex) {
      errors.push(`${expected.className} node ${expected.nodeId} has classStartIndex ${String(node.classStartIndex)} instead of ${expected.classStartIndex}.`);
    }
    if (node.name.trim().toLowerCase() !== expected.className.toLowerCase()) {
      errors.push(`${expected.className} PoB class start ${expected.nodeId} resolved as ${node.name}.`);
    }
  }

  const witchStart = nodeById(snapshot, POB_PASSIVE_REFERENCE.witchFirstNode.classStartNodeId);
  const first = nodeById(snapshot, POB_PASSIVE_REFERENCE.witchFirstNode.nodeId);
  if (!first) {
    errors.push(`PoB regression node ${POB_PASSIVE_REFERENCE.witchFirstNode.nodeId} (${POB_PASSIVE_REFERENCE.witchFirstNode.name}) is missing.`);
  } else {
    const expected = POB_PASSIVE_REFERENCE.witchFirstNode;
    if (first.name !== expected.name || first.group !== expected.group || first.orbit !== expected.orbit || first.orbitIndex !== expected.orbitIndex) {
      errors.push(`PoB regression node ${expected.nodeId} identity/group/orbit geometry differs from 3.29.`);
    }
    if (!first.out?.includes(expected.classStartNodeId) && !witchStart?.out?.includes(expected.nodeId)) {
      errors.push(`PoB Witch start ${expected.classStartNodeId} is not connected to ${expected.name} (${expected.nodeId}).`);
    }
    if (witchStart?.x !== undefined && witchStart.y !== undefined && first.x !== undefined && first.y !== undefined) {
      // PoB 3.29: orbit 3 has radius 335 and orbitIndex 15 is 330 degrees.
      const angle = 330 * Math.PI / 180;
      const expectedDx = Math.sin(angle) * 335;
      const expectedDy = -Math.cos(angle) * 335;
      if (!close(first.x - witchStart.x, expectedDx) || !close(first.y - witchStart.y, expectedDy)) {
        errors.push('Witch start -> Spell Damage and Mana relative geometry differs from Path of Building 3.29.');
      }
    } else {
      errors.push('Witch start regression geometry is incomplete.');
    }
  }

  return errors;
}

export function assertPobPassiveReference(snapshot: PassiveTreeSnapshot): void {
  const errors = pobPassiveReferenceErrors(snapshot);
  if (errors.length) {
    throw new Error(`Passive tree disagrees with pinned Path of Building ${POB_PASSIVE_REFERENCE.treeVersion}: ${errors.join(' ')}`);
  }
}
