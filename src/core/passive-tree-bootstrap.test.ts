import { describe, expect, it } from 'vitest';
import {
  detectPassiveBootstrapCandidates,
  solvePassiveTreeBootstrap,
  type PassiveBootstrapCandidate,
} from './passive-tree-bootstrap';
import { projectPassiveTreePoint, type TreePoint } from './passive-tree-hud';

function localAnchors(rotation: number): TreePoint[] {
  const result: TreePoint[] = [{ id: 1, x: 0, y: 0 }];
  const vectors = [
    [0, -180], [135, -135], [205, 20], [120, 180], [-80, 230], [-210, 80], [-180, -125], [35, -300],
  ];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  vectors.forEach(([x, y], index) => result.push({
    id: index + 2,
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }));
  return result;
}

function candidatesFor(anchors: TreePoint[], transform: { scale: number; offsetX: number; offsetY: number; ySign: 1 }): PassiveBootstrapCandidate[] {
  const candidates = anchors.map((anchor, index) => {
    const point = projectPassiveTreePoint(transform, anchor);
    return {
      x: point.x + (index % 2 ? 0.8 : -0.5),
      y: point.y + (index % 3 ? 0.6 : -0.7),
      radius: index === 0 ? 18 : 10 + (index % 2),
      score: index === 0 ? 70 : 45 - index,
    };
  });
  return [
    ...candidates,
    { x: 80, y: 70, radius: 17, score: 49 },
    { x: 1540, y: 780, radius: 15, score: 48 },
    { x: 420, y: 880, radius: 9, score: 43 },
    { x: 1200, y: 170, radius: 10, score: 40 },
  ];
}

function drawRing(bitmap: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, value: number) {
  for (let y = Math.max(0, cy - radius - 3); y <= Math.min(height - 1, cy + radius + 3); y += 1) {
    for (let x = Math.max(0, cx - radius - 3); x <= Math.min(width - 1, cx + radius + 3); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (Math.abs(distance - radius) > 1.2) continue;
      const offset = (y * width + x) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
}

describe('automatic passive tree bootstrap', () => {
  it.each([0, 0.52, 1.05, 1.57, 2.09, 2.62, 3.14])('locks the known large class/root node for orientation %.2f', (rotation) => {
    const anchors = localAnchors(rotation);
    const expected = { scale: 0.108, offsetX: 960, offsetY: 540, ySign: 1 as const };
    const result = solvePassiveTreeBootstrap(anchors[0], anchors, candidatesFor(anchors, expected), expected.scale, { width: 1920, height: 1080 });
    expect(result).toBeDefined();
    expect(result!.inliers).toBeGreaterThanOrEqual(8);
    expect(result!.confidence).toBeGreaterThan(0.8);
    expect(result!.transform.scale).toBeCloseTo(expected.scale, 6);
    expect(result!.transform.offsetX).toBeCloseTo(expected.offsetX, 0);
    expect(result!.transform.offsetY).toBeCloseTo(expected.offsetY, 0);
  });

  it('fails closed when two equally plausible large roots exist', () => {
    const anchors = localAnchors(0.2);
    const expected = { scale: 0.108, offsetX: 930, offsetY: 520, ySign: 1 as const };
    const first = candidatesFor(anchors, expected);
    const secondTransform = { ...expected, offsetX: 1500, offsetY: 760 };
    const second = candidatesFor(anchors, secondTransform).slice(0, anchors.length);
    expect(solvePassiveTreeBootstrap(anchors[0], anchors, [...first, ...second], expected.scale, { width: 1920, height: 1080 })).toBeUndefined();
  });

  it('fails closed if the proposed anchor is not visually larger than neighbours', () => {
    const anchors = localAnchors(0.6);
    const expected = { scale: 0.144, offsetX: 1280, offsetY: 720, ySign: 1 as const };
    const candidates = candidatesFor(anchors, expected).map((candidate) => ({ ...candidate, radius: 10 }));
    expect(solvePassiveTreeBootstrap(anchors[0], anchors, candidates, expected.scale, { width: 2560, height: 1440 })).toBeUndefined();
  });

  it('detects radial bootstrap candidates in a synthetic passive-like image', () => {
    const width = 420;
    const height = 240;
    const bitmap = new Uint8Array(width * height * 4);
    for (let index = 0; index < bitmap.length; index += 4) {
      bitmap[index] = 34;
      bitmap[index + 1] = 34;
      bitmap[index + 2] = 34;
      bitmap[index + 3] = 255;
    }
    drawRing(bitmap, width, height, 110, 120, 12, 220);
    drawRing(bitmap, width, height, 245, 104, 7, 185);
    const result = detectPassiveBootstrapCandidates(bitmap, width, height, { stride: 3 });
    expect(result.some((candidate) => Math.hypot(candidate.x - 110, candidate.y - 120) <= 6)).toBe(true);
    expect(result.some((candidate) => Math.hypot(candidate.x - 245, candidate.y - 104) <= 6)).toBe(true);
  });
});
