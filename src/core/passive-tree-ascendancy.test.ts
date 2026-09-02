import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  passiveAscendancyStarts,
  passiveNodeScopeKey,
  validatePassiveTreeSnapshot,
} from './passive-data';
import {
  passiveHudScopeForNode,
  passiveHudScopesForTargets,
  projectPassiveTreePoint,
  registerPassiveTreePointCloud,
  selectPassiveHudAnchors,
  type PassiveTreeTransform,
} from './passive-tree-hud';

function bundledSnapshot() {
  const raw = JSON.parse(readFileSync(path.resolve('assets/game-data/passive-tree-3.29.json'), 'utf8')) as unknown;
  const snapshot = validatePassiveTreeSnapshot(raw);
  if (!snapshot) throw new Error('Bundled passive snapshot is invalid.');
  return snapshot;
}

describe('Ascendancy Passive Tree HUD geometry', () => {
  const snapshot = bundledSnapshot();

  it('preserves every GGG-published Ascendancy as an independently registrable fixed scope', () => {
    const ascendancyNodes = snapshot.nodes.filter((node) => node.kind === 'ascendancy');
    const starts = passiveAscendancyStarts(snapshot);
    expect(ascendancyNodes.length).toBeGreaterThanOrEqual(300);
    expect(starts.length).toBeGreaterThanOrEqual(18);
    expect(new Set(starts.map((node) => node.ascendancyName?.toLowerCase())).size).toBe(starts.length);

    const groups = new Map<string, number>();
    for (const node of ascendancyNodes) {
      expect(node.dynamic).not.toBe(true);
      expect(node.x).toEqual(expect.any(Number));
      expect(node.y).toEqual(expect.any(Number));
      expect(node.ascendancyName).toBeTruthy();
      expect(passiveNodeScopeKey(node)).toBe(`ascendancy:${node.ascendancyName!.toLowerCase()}`);
      groups.set(node.ascendancyName!, (groups.get(node.ascendancyName!) ?? 0) + 1);
    }
    for (const start of starts) {
      expect(groups.get(start.ascendancyName!)).toBeGreaterThanOrEqual(2);
      expect(start.ascendancyStart).toBe(true);
    }
  });

  it('keeps base tree and different Ascendancies in separate registration scopes', () => {
    const base = snapshot.nodes.find((node) => node.kind === 'class-start')!;
    const deadeye = snapshot.nodes.find((node) => node.ascendancyName === 'Deadeye' && !node.ascendancyStart)!;
    const occultist = snapshot.nodes.find((node) => node.ascendancyName === 'Occultist' && !node.ascendancyStart)!;
    expect(passiveHudScopesForTargets(snapshot, [base.id, deadeye.id, occultist.id])).toEqual([
      'base',
      'ascendancy:deadeye',
      'ascendancy:occultist',
    ]);
    expect(passiveHudScopeForNode(snapshot, deadeye.id)).toBe('ascendancy:deadeye');
  });

  it('registers an Ascendancy from local geometry without relying on its scrambled absolute tree position', () => {
    const target = snapshot.nodes.find((node) => node.ascendancyName === 'Deadeye' && !node.ascendancyStart)!;
    const operations = [{ nodeId: target.id }];
    const anchors = selectPassiveHudAnchors(snapshot, operations, 0, {
      targetNodeIds: [target.id],
      scopeKey: 'ascendancy:deadeye',
      neighbourDepth: 3,
      maxAnchors: 14,
    });
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    const nodeIndex = new Map(snapshot.nodes.map((node) => [node.id, node]));
    expect(anchors.every((anchor) => nodeIndex.get(anchor.id)?.ascendancyName === 'Deadeye')).toBe(true);

    // Translation is deliberately arbitrary. This proves the registration only
    // depends on the Ascendancy's relative geometry, the same property PoB's
    // upstream fixer preserves when it translates whole Ascendancy groups.
    const transform: PassiveTreeTransform = { scale: 0.12, offsetX: 1080, offsetY: 610, ySign: 1 };
    const candidates = anchors.map((anchor, index) => {
      const point = projectPassiveTreePoint(transform, anchor);
      return { x: point.x + (index % 2 ? 0.45 : -0.45), y: point.y + (index % 3 ? 0.25 : -0.25), score: 100 - index, radius: 10 };
    });
    const registration = registerPassiveTreePointCloud(anchors, candidates, {
      minScale: 0.02,
      maxScale: 0.6,
      tolerancePx: 5,
      minInliers: Math.min(6, anchors.length),
      maxScreenCandidates: 40,
    });
    expect(registration).toBeDefined();
    expect(registration!.confidence).toBeGreaterThan(0.75);
    expect(registration!.rms).toBeLessThan(2);
  });
});
