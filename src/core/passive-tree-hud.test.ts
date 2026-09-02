import { describe, expect, it } from 'vitest';
import {
  edgeIndicatorForTarget,
  mapCapturePointToDisplay,
  projectPassiveTreePoint,
  registerPassiveTreePointCloud,
  selectPassiveHudAnchors,
  solvePassiveTreeTransform,
  type PassiveTreeTransform,
  type ScreenPoint,
  type TreePoint,
} from './passive-tree-hud';
import type { PassiveTreeSnapshot } from './passive-data';

const ANCHORS: TreePoint[] = [
  { id: 1, x: -900, y: -420 },
  { id: 2, x: -510, y: 180 },
  { id: 3, x: 0, y: 0 },
  { id: 4, x: 360, y: -530 },
  { id: 5, x: 720, y: 260 },
  { id: 6, x: 1040, y: 710 },
  { id: 7, x: -120, y: 820 },
];

function visible(transform: PassiveTreeTransform, noise = 0): ScreenPoint[] {
  return ANCHORS.map((anchor, index) => {
    const point = projectPassiveTreePoint(transform, anchor);
    return {
      x: point.x + (index % 2 ? noise : -noise),
      y: point.y + (index % 3 ? noise * 0.5 : -noise * 0.5),
      score: 100 - index,
      radius: 9,
    };
  });
}

function expectTransformClose(actual: PassiveTreeTransform, expected: PassiveTreeTransform, precision = 2) {
  expect(actual.scale).toBeCloseTo(expected.scale, precision);
  expect(actual.offsetX).toBeCloseTo(expected.offsetX, 0);
  expect(actual.offsetY).toBeCloseTo(expected.offsetY, 0);
  expect(actual.ySign).toBe(expected.ySign);
}

describe('Passive Tree HUD geometry', () => {
  it.each([
    ['1920x1080', { scale: 0.061, offsetX: 960, offsetY: 540, ySign: 1 as const }],
    ['2560x1440', { scale: 0.083, offsetX: 1280, offsetY: 720, ySign: 1 as const }],
    ['3440x1440 ultrawide', { scale: 0.078, offsetX: 1740, offsetY: 690, ySign: 1 as const }],
    ['3840x2160 zoomed', { scale: 0.132, offsetX: 1910, offsetY: 1090, ySign: 1 as const }],
  ])('registers synthetic %s zoom/pan without resolution-specific coordinates', (_label, expected) => {
    const candidates = [
      ...visible(expected, 0.7),
      { x: 40, y: 40, score: 8 },
      { x: 300, y: 990, score: 7 },
      { x: 1700, y: 120, score: 6 },
    ];
    const result = registerPassiveTreePointCloud(ANCHORS, candidates, {
      minScale: 0.02,
      maxScale: 0.2,
      tolerancePx: 5,
      minInliers: 6,
      maxScreenCandidates: 20,
    });
    expect(result).toBeDefined();
    expect(result!.inliers).toBe(7);
    expect(result!.rms).toBeLessThan(2);
    expect(result!.confidence).toBeGreaterThan(0.8);
    expectTransformClose(result!.transform, expected);
  });

  it('refines scale and translation from noisy correspondences', () => {
    const expected: PassiveTreeTransform = { scale: 0.09, offsetX: 1370, offsetY: 680, ySign: 1 };
    const matches = ANCHORS.map((tree, index) => {
      const screen = projectPassiveTreePoint(expected, tree);
      return { tree, screen: { x: screen.x + (index - 3) * 0.3, y: screen.y - (index - 3) * 0.2 } };
    });
    const solved = solvePassiveTreeTransform(matches);
    expect(solved).toBeDefined();
    expectTransformClose(solved!, expected);
  });

  it('rejects an unrelated point cloud instead of inventing a target location', () => {
    const unrelated = Array.from({ length: 12 }, (_, index) => ({
      x: 80 + index * 73,
      y: 90 + ((index * 191) % 640),
      score: 50 - index,
    }));
    const result = registerPassiveTreePointCloud(ANCHORS, unrelated, {
      minScale: 0.02,
      maxScale: 0.2,
      tolerancePx: 3,
      minInliers: 6,
      maxScreenCandidates: 20,
    });
    expect(result).toBeUndefined();
  });

  it('supports explicit Y-axis inversion without silently enabling it by default', () => {
    const expected: PassiveTreeTransform = { scale: 0.07, offsetX: 900, offsetY: 520, ySign: -1 };
    expect(registerPassiveTreePointCloud(ANCHORS, visible(expected), {
      minScale: 0.02, maxScale: 0.2, tolerancePx: 3, minInliers: 6,
    })).toBeUndefined();
    const result = registerPassiveTreePointCloud(ANCHORS, visible(expected), {
      minScale: 0.02, maxScale: 0.2, tolerancePx: 3, minInliers: 6, allowYFlip: true,
    });
    expect(result).toBeDefined();
    expectTransformClose(result!.transform, expected);
  });

  it('maps downscaled capture coordinates back into a monitor with an offset', () => {
    const mapped = mapCapturePointToDisplay(
      { x: 640, y: 360 },
      { width: 1280, height: 720 },
      { x: 1920, y: 0, width: 3440, height: 1440 },
    );
    expect(mapped).toEqual({ x: 3640, y: 720 });
  });

  it('produces an edge arrow only when the next passive is offscreen', () => {
    expect(edgeIndicatorForTarget({ x: 900, y: 500 }, 1920, 1080, 60).visible).toBe(false);
    const right = edgeIndicatorForTarget({ x: 2600, y: 640 }, 1920, 1080, 60);
    expect(right.visible).toBe(true);
    expect(right.x).toBeCloseTo(1860, 0);
    expect(right.y).toBeGreaterThan(500);
    expect(right.angle).toBeGreaterThan(-0.2);
  });

  it('selects the next Maxroll node plus local graph/path anchors', () => {
    const nodes = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      name: `Node ${index + 1}`,
      kind: index === 0 ? 'class-start' as const : 'normal' as const,
      x: index * 180,
      y: (index % 2) * 120,
      group: index,
      orbit: 0,
      orbitIndex: 0,
      out: index < 9 ? [index + 2] : [],
      ...(index === 0 ? { classStartIndex: 2 } : {}),
    }));
    const snapshot: PassiveTreeSnapshot = {
      schemaVersion: 2,
      gameVersion: '3.29',
      generatedAt: '2026-09-02T00:00:00.000Z',
      source: { url: 'test', sha256: '0'.repeat(64) },
      bounds: { minX: 0, minY: -100, maxX: 1800, maxY: 300 },
      skillsPerOrbit: [1],
      orbitRadii: [0],
      nodes,
    };
    const operations = nodes.slice(1, 9).map((node) => ({ nodeId: node.id }));
    const anchors = selectPassiveHudAnchors(snapshot, operations, 3, { maxAnchors: 8 });
    expect(anchors.some((anchor) => anchor.id === operations[3].nodeId)).toBe(true);
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    expect(new Set(anchors.map((anchor) => anchor.id)).size).toBe(anchors.length);
  });
});
