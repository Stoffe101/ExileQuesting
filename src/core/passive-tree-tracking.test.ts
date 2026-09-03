import { describe, expect, it } from 'vitest';
import { projectPassiveTreePoint, type PassiveTreeRegistration, type PassiveTreeTransform, type TreePoint } from './passive-tree-hud';
import { trackPassiveTreeRegistration } from './passive-tree-tracking';

const anchors: TreePoint[] = [
  { id: 1, x: -900, y: -420 },
  { id: 2, x: -510, y: 180 },
  { id: 3, x: 0, y: 0 },
  { id: 4, x: 360, y: -530 },
  { id: 5, x: 720, y: 260 },
  { id: 6, x: 1040, y: 710 },
  { id: 7, x: -120, y: 820 },
  { id: 8, x: 480, y: 760 },
];

function candidates(transform: PassiveTreeTransform, noise = 0.5) {
  return anchors.map((anchor, index) => {
    const point = projectPassiveTreePoint(transform, anchor);
    return {
      x: point.x + (index % 2 ? noise : -noise),
      y: point.y + (index % 3 ? noise * 0.6 : -noise * 0.6),
      score: 100 - index,
      radius: 7,
    };
  });
}

function registration(transform: PassiveTreeTransform): PassiveTreeRegistration {
  const points = candidates(transform, 0);
  return {
    transform,
    matches: anchors.map((tree, index) => ({ tree, screen: points[index], distance: 0 })),
    inliers: anchors.length,
    rms: 0,
    confidence: 1,
  };
}

function expectClose(actual: PassiveTreeTransform, expected: PassiveTreeTransform) {
  expect(actual.scale).toBeCloseTo(expected.scale, 2);
  expect(actual.offsetX).toBeCloseTo(expected.offsetX, 0);
  expect(actual.offsetY).toBeCloseTo(expected.offsetY, 0);
  expect(actual.ySign).toBe(expected.ySign);
}

describe('passive tree local tracking', () => {
  const base: PassiveTreeTransform = { scale: 0.08, offsetX: 640, offsetY: 360, ySign: 1 };

  it('keeps a stable lock without full point-pair reacquisition', () => {
    const tracked = trackPassiveTreeRegistration(registration(base), anchors, candidates(base));
    expect(tracked).toBeDefined();
    expect(tracked!.inliers).toBe(anchors.length);
    expectClose(tracked!.transform, base);
  });

  it('tracks an ordinary pan', () => {
    const moved: PassiveTreeTransform = { ...base, offsetX: 714, offsetY: 303 };
    const tracked = trackPassiveTreeRegistration(registration(base), anchors, candidates(moved));
    expect(tracked).toBeDefined();
    expect(tracked!.inliers).toBeGreaterThanOrEqual(7);
    expectClose(tracked!.transform, moved);
  });

  it.each([0.93, 1.07])('tracks a modest %.2fx zoom together with pan', (factor) => {
    const moved: PassiveTreeTransform = { scale: base.scale * factor, offsetX: 690, offsetY: 330, ySign: 1 };
    const tracked = trackPassiveTreeRegistration(registration(base), anchors, candidates(moved));
    expect(tracked).toBeDefined();
    expect(tracked!.inliers).toBeGreaterThanOrEqual(7);
    expectClose(tracked!.transform, moved);
  });

  it('tracks a fast pan and substantial zoom in one update when live tracking widens the search', () => {
    const moved: PassiveTreeTransform = { scale: base.scale * 1.55, offsetX: 1110, offsetY: 92, ySign: 1 };
    const tracked = trackPassiveTreeRegistration(registration(base), anchors, candidates(moved), {
      maximumOffsetShiftPx: 900,
      scaleFactors: [0.72, 0.86, 1, 1.18, 1.38, 1.55, 1.8],
      minimumScaleRatio: 0.6,
      maximumScaleRatio: 1.9,
      tolerancePx: 12,
    });
    expect(tracked).toBeDefined();
    expect(tracked!.inliers).toBeGreaterThanOrEqual(7);
    expectClose(tracked!.transform, moved);
  });

  it('reacquires after a very large pan and multi-step zoom when explicitly using the wide search', () => {
    const moved: PassiveTreeTransform = { scale: base.scale * 2.4, offsetX: 1530, offsetY: -310, ySign: 1 };
    const tracked = trackPassiveTreeRegistration(registration(base), anchors, candidates(moved), {
      maximumOffsetShiftPx: 2400,
      scaleFactors: [0.35, 0.5, 0.7, 1, 1.4, 1.8, 2.4, 3.2],
      minimumScaleRatio: 0.25,
      maximumScaleRatio: 3.5,
      minimumInliers: 6,
      tolerancePx: 14,
      minimumConfidence: 0.6,
    });
    expect(tracked).toBeDefined();
    expect(tracked!.inliers).toBeGreaterThanOrEqual(6);
    expectClose(tracked!.transform, moved);
  });

  it('fails closed on an unrelated screen so the service can perform wider tree-only reacquisition', () => {
    const unrelated = Array.from({ length: 20 }, (_, index) => ({
      x: 30 + ((index * 137) % 1100),
      y: 40 + ((index * 211) % 640),
      score: 100 - index,
    }));
    expect(trackPassiveTreeRegistration(registration(base), anchors, unrelated)).toBeUndefined();
  });

  it('still fails closed after a very large jump when only the normal local window is allowed', () => {
    const jumped: PassiveTreeTransform = { ...base, offsetX: 980, offsetY: 700 };
    expect(trackPassiveTreeRegistration(registration(base), anchors, candidates(jumped))).toBeUndefined();
  });
});
