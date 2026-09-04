import { describe, expect, it } from 'vitest';
import type { PassiveNodeRecord, PassiveTreeSnapshot } from './passive-data';
import { POB_PASSIVE_REFERENCE, pobPassiveReferenceErrors } from './pob-passive-reference';

function classStart(className: string, classStartIndex: number, id: number): PassiveNodeRecord {
  return {
    id,
    name: className,
    kind: 'class-start',
    classStartIndex,
    group: 100 + classStartIndex,
    orbit: 0,
    orbitIndex: 0,
    x: classStartIndex * 1000,
    y: classStartIndex * -1000,
  };
}

function fixture(): PassiveTreeSnapshot {
  const starts = POB_PASSIVE_REFERENCE.classStarts.map((entry) => classStart(entry.className, entry.classStartIndex, entry.nodeId));
  const witch = starts.find((node) => node.id === POB_PASSIVE_REFERENCE.witchFirstNode.classStartNodeId)!;
  witch.group = POB_PASSIVE_REFERENCE.witchFirstNode.group;
  witch.x = -4.055;
  witch.y = -3179.89;
  witch.out = [POB_PASSIVE_REFERENCE.witchFirstNode.nodeId];

  const angle = 330 * Math.PI / 180;
  const first: PassiveNodeRecord = {
    id: POB_PASSIVE_REFERENCE.witchFirstNode.nodeId,
    name: POB_PASSIVE_REFERENCE.witchFirstNode.name,
    kind: 'normal',
    group: POB_PASSIVE_REFERENCE.witchFirstNode.group,
    orbit: POB_PASSIVE_REFERENCE.witchFirstNode.orbit,
    orbitIndex: POB_PASSIVE_REFERENCE.witchFirstNode.orbitIndex,
    x: witch.x + Math.sin(angle) * 335,
    y: witch.y - Math.cos(angle) * 335,
    out: [witch.id],
  };

  return {
    schemaVersion: 2,
    gameVersion: POB_PASSIVE_REFERENCE.gameVersion,
    generatedAt: '2026-09-03T00:00:00.000Z',
    source: { url: 'fixture', sha256: '0'.repeat(64) },
    bounds: { ...POB_PASSIVE_REFERENCE.bounds },
    skillsPerOrbit: [...POB_PASSIVE_REFERENCE.skillsPerOrbit],
    orbitRadii: [...POB_PASSIVE_REFERENCE.orbitRadii],
    nodes: [...starts, first],
  };
}

describe('Path of Building passive-tree reference', () => {
  it('accepts the pinned PoB 3.29 class starts and Witch first-node geometry', () => {
    expect(pobPassiveReferenceErrors(fixture())).toEqual([]);
  });

  it('rejects a wrong Witch class-start ID interpretation', () => {
    const snapshot = fixture();
    snapshot.nodes = snapshot.nodes.filter((node) => node.id !== 54447);
    snapshot.nodes.push(classStart('Witch', 3, 99999));
    expect(pobPassiveReferenceErrors(snapshot).join(' ')).toContain('Witch PoB class start 54447 is missing');
  });

  it('rejects the screen-space-style displacement seen in the v0.2.4 failure', () => {
    const snapshot = fixture();
    const first = snapshot.nodes.find((node) => node.id === POB_PASSIVE_REFERENCE.witchFirstNode.nodeId)!;
    first.x! += 600;
    first.y! += 250;
    expect(pobPassiveReferenceErrors(snapshot).join(' ')).toContain('relative geometry differs');
  });
});
