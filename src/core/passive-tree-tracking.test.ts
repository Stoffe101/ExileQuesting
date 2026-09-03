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

  it('fails closed on an unrelated screen so the service can perform full reacquisition', () => {
    const unrelated = Array.from({ length: 20 }, (_, index) => ({
      x: 30 + ((index * 137) % 1100),
      y: 40 + ((index * 211) % 640),
      score: 100 - index,
    }));
    expect(trackPassiveTreeRegistration(registration(base), anchors, unrelated)).toBeUndefined();
  });

  it('fails closed after a very large jump outside the local tracking window', () => {
    const jumped: PassiveTreeTransform = { ...base, offsetX: 980, offsetY: 700 };
    expect(trackPassiveTreeRegistration(registration(base), anchors, candidates(jumped))).toBeUndefined();
  });
});
