import { describe, expect, it } from 'vitest';
import { passiveTreePresence } from './passive-tree-presence';

function treeLike(width: number, height: number) {
  return [
    [0.14, 0.18], [0.31, 0.15], [0.51, 0.19], [0.75, 0.16], [0.88, 0.28],
    [0.19, 0.44], [0.43, 0.39], [0.66, 0.43], [0.83, 0.52],
    [0.12, 0.71], [0.35, 0.68], [0.59, 0.76], [0.79, 0.73],
  ].map(([x, y], index) => ({ x: x * width, y: y * height, score: 100 - index }));
}

describe('passive tree presence gate', () => {
  it.each([
    [1920, 1080],
    [2560, 1440],
    [3440, 1440],
    [5120, 1440],
  ])('accepts a distributed passive-node constellation at %sx%s', (width, height) => {
    const presence = passiveTreePresence(treeLike(width, height), width, height);
    expect(presence.visible).toBe(true);
    expect(presence.interiorCandidates).toBeGreaterThanOrEqual(5);
    expect(presence.occupiedCells).toBeGreaterThanOrEqual(5);
    expect(presence.score).toBeGreaterThan(0.95);
  });

  it('rejects ordinary HUD-like circles clustered along the bottom edge', () => {
    const width = 1920;
    const height = 1080;
    const candidates = Array.from({ length: 18 }, (_, index) => ({
      x: 320 + index * 70,
      y: 930 + (index % 3) * 24,
      score: 80 - index,
    }));
    const presence = passiveTreePresence(candidates, width, height);
    expect(presence.visible).toBe(false);
    expect(presence.verticalSpan).toBeLessThan(0.1);
  });

  it('rejects a dense collection of circular HUD elements that only hugs screen edges', () => {
    const width = 1920;
    const height = 1080;
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) => ({ x: 40 + index * 330, y: 45, score: 90 - index })),
      ...Array.from({ length: 6 }, (_, index) => ({ x: 45, y: 170 + index * 145, score: 80 - index })),
      ...Array.from({ length: 6 }, (_, index) => ({ x: 1870, y: 150 + index * 145, score: 70 - index })),
      ...Array.from({ length: 6 }, (_, index) => ({ x: 80 + index * 330, y: 1035, score: 60 - index })),
    ];
    const presence = passiveTreePresence(candidates, width, height);
    expect(presence.horizontalSpan).toBeGreaterThan(0.8);
    expect(presence.verticalSpan).toBeGreaterThan(0.8);
    expect(presence.interiorCandidates).toBe(0);
    expect(presence.visible).toBe(false);
  });

  it('rejects sparse radial decoration even when it spans the client', () => {
    const presence = passiveTreePresence([
      { x: 100, y: 100 }, { x: 900, y: 120 }, { x: 1700, y: 100 },
      { x: 120, y: 900 }, { x: 1700, y: 900 },
    ], 1920, 1080);
    expect(presence.visible).toBe(false);
    expect(presence.candidateCount).toBe(5);
  });

  it('fails closed on invalid dimensions', () => {
    expect(passiveTreePresence([{ x: 1, y: 1 }], 0, 1080).visible).toBe(false);
  });
});
