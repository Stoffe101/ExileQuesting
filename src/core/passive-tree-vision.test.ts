import { describe, expect, it } from 'vitest';
import { detectPassiveTreeNodeCandidates } from './passive-tree-vision';

function bitmap(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

function setPixel(image: Uint8Array, width: number, x: number, y: number, value: number) {
  const offset = (y * width + x) * 4;
  image[offset] = value;
  image[offset + 1] = value;
  image[offset + 2] = value;
  image[offset + 3] = 255;
}

function drawRing(image: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, value = 235) {
  for (let y = Math.max(0, cy - radius - 2); y <= Math.min(height - 1, cy + radius + 2); y += 1) {
    for (let x = Math.max(0, cx - radius - 2); x <= Math.min(width - 1, cx + radius + 2); x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (Math.abs(distance - radius) <= 1.2) setPixel(image, width, x, y, value);
    }
  }
}

describe('passive tree visual node detection', () => {
  it('detects repeated radial node centres and suppresses nearby duplicates', () => {
    const width = 320;
    const height = 200;
    const image = bitmap(width, height);
    const expected = [
      { x: 64, y: 64, radius: 8 },
      { x: 144, y: 72, radius: 12 },
      { x: 232, y: 132, radius: 8 },
    ];
    for (const ring of expected) drawRing(image, width, height, ring.x, ring.y, ring.radius);
    // Straight UI decoration should not have enough radial coverage.
    for (let y = 30; y < 170; y += 1) setPixel(image, width, 288, y, 255);

    const candidates = detectPassiveTreeNodeCandidates(image, width, height, {
      radii: [8, 12],
      stride: 4,
      angularSamples: 16,
      minimumContrast: 20,
      minimumCoverage: 0.6,
      maximumCandidates: 20,
    });

    for (const ring of expected) {
      expect(candidates.some((candidate) => Math.hypot(candidate.x - ring.x, candidate.y - ring.y) <= 5)).toBe(true);
    }
    expect(candidates.filter((candidate) => Math.abs(candidate.x - 288) < 5).length).toBe(0);
    expect(candidates.length).toBeLessThanOrEqual(20);
  });

  it('returns no candidates for a flat capture', () => {
    const width = 240;
    const height = 160;
    const image = new Uint8Array(width * height * 4).fill(24);
    expect(detectPassiveTreeNodeCandidates(image, width, height, { radii: [6, 10], stride: 4 })).toEqual([]);
  });

  it('rejects malformed or oversized bitmap inputs', () => {
    expect(detectPassiveTreeNodeCandidates(new Uint8Array(3), 100, 100)).toEqual([]);
    expect(detectPassiveTreeNodeCandidates(new Uint8Array(4), 0, 1)).toEqual([]);
    expect(detectPassiveTreeNodeCandidates(new Uint8Array(4), 3000, 3000)).toEqual([]);
  });
});
