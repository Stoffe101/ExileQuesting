import { describe, expect, it } from 'vitest';
import {
  createPassiveTreeScreenSignature,
  matchPassiveTreeScreenSignature,
  passiveTreeScreenCheckRegion,
  validatePassiveTreeScreenSignature,
} from './passive-tree-screen-check';

function bitmap(width: number, height: number, regionValue: (x: number, y: number) => number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  bytes.fill(24);
  const region = passiveTreeScreenCheckRegion(width, height);
  if (!region) throw new Error('test region missing');
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const value = Math.max(0, Math.min(255, Math.round(regionValue(x - region.x, y - region.y))));
      const offset = (y * width + x) * 4;
      bytes[offset] = value;
      bytes[offset + 1] = value;
      bytes[offset + 2] = value;
      bytes[offset + 3] = 255;
    }
  }
  return bytes;
}

function treePattern(x: number, y: number): number {
  return (x * 19 + y * 41 + ((x + y) % 3) * 37) % 210 + 20;
}

describe('passive tree static header screen check', () => {
  it('uses the narrow top-centre region proven by Exile-UI', () => {
    expect(passiveTreeScreenCheckRegion(1920, 1080)).toEqual({ x: 926, y: 58, width: 68, height: 22 });
  });

  it('accepts the same passive-tree header and small capture variation', () => {
    const width = 640;
    const height = 360;
    const reference = bitmap(width, height, treePattern);
    const signature = createPassiveTreeScreenSignature(reference, width, height);
    expect(signature).toBeDefined();
    expect(matchPassiveTreeScreenSignature(signature!, reference, width, height).matched).toBe(true);

    const slightlyDifferent = bitmap(width, height, (x, y) => treePattern(x, y) + ((x + y) % 2 ? 10 : -10));
    const result = matchPassiveTreeScreenSignature(signature!, slightlyDifferent, width, height);
    expect(result.matched).toBe(true);
    expect(result.meanAbsoluteError).toBeLessThanOrEqual(18);
  });

  it('rejects an unrelated gameplay-like header instead of treating generic shapes as the tree', () => {
    const width = 640;
    const height = 360;
    const reference = bitmap(width, height, treePattern);
    const signature = createPassiveTreeScreenSignature(reference, width, height)!;
    const gameplay = bitmap(width, height, (x, y) => 235 - treePattern(x, y));
    const result = matchPassiveTreeScreenSignature(signature, gameplay, width, height);
    expect(result.matched).toBe(false);
    expect(result.closePixelRatio).toBeLessThan(0.86);
  });

  it('fails closed on malformed signatures and truncated captures', () => {
    expect(validatePassiveTreeScreenSignature({ schemaVersion: 1, sampleWidth: 2, sampleHeight: 2, values: [1, 2] })).toBeUndefined();
    const signature = createPassiveTreeScreenSignature(bitmap(640, 360, treePattern), 640, 360)!;
    const result = matchPassiveTreeScreenSignature(signature, new Uint8Array(12), 640, 360);
    expect(result.matched).toBe(false);
  });
});
