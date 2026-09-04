import { describe, expect, it } from 'vitest';
import {
  comparePassiveTargetPatches,
  passiveTargetOperationLooksComplete,
  passiveTargetPatchIsGrossMismatch,
  samplePassiveTargetPatch,
} from './passive-target-visual';

function frame(width: number, height: number, ringValue: number, centerValue = 82): Uint8Array {
  const bitmap = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const radius = Math.hypot(x - cx, y - cy);
      const value = radius >= 15 && radius <= 25 ? ringValue : radius < 15 ? centerValue : 28 + ((x * 7 + y * 11) % 13);
      const offset = (y * width + x) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  return bitmap;
}

function patch(bitmap: Uint8Array, width = 200, height = 120) {
  return samplePassiveTargetPatch(bitmap, { width, height }, { width, height }, { x: width / 2, y: height / 2, radius: 30 })!;
}

describe('passive target visual watchdog', () => {
  it('treats the unchanged exact target as locally verified', () => {
    const reference = patch(frame(200, 120, 80));
    const current = patch(frame(200, 120, 80));
    const comparison = comparePassiveTargetPatches(reference, current)!;
    expect(comparison.difference).toBeLessThan(0.01);
    expect(comparison.similarity).toBeGreaterThan(0.99);
    expect(passiveTargetPatchIsGrossMismatch(comparison)).toBe(false);
  });

  it('recognises a persistent allocation-style ring brightening', () => {
    const reference = patch(frame(200, 120, 66));
    const allocated = patch(frame(200, 120, 190, 108));
    const comparison = comparePassiveTargetPatches(reference, allocated)!;
    expect(comparison.ringDelta).toBeGreaterThan(4);
    expect(passiveTargetOperationLooksComplete(comparison, 'allocate')).toBe(true);
    expect(passiveTargetOperationLooksComplete(comparison, 'refund')).toBe(false);
  });

  it('recognises a persistent refund-style ring dimming', () => {
    const allocated = patch(frame(200, 120, 192, 108));
    const refunded = patch(frame(200, 120, 62, 82));
    const comparison = comparePassiveTargetPatches(allocated, refunded)!;
    expect(comparison.ringDelta).toBeLessThan(-4);
    expect(passiveTargetOperationLooksComplete(comparison, 'refund')).toBe(true);
    expect(passiveTargetOperationLooksComplete(comparison, 'allocate')).toBe(false);
  });

  it('does not call a small lighting fluctuation an allocation', () => {
    const reference = patch(frame(200, 120, 90));
    const fluctuation = patch(frame(200, 120, 96, 86));
    const comparison = comparePassiveTargetPatches(reference, fluctuation)!;
    expect(passiveTargetOperationLooksComplete(comparison, 'allocate')).toBe(false);
    expect(passiveTargetPatchIsGrossMismatch(comparison)).toBe(false);
  });

  it('flags a completely unrelated target neighbourhood only as a mismatch', () => {
    const reference = patch(frame(200, 120, 70));
    const unrelatedBitmap = new Uint8Array(200 * 120 * 4);
    for (let i = 0; i < unrelatedBitmap.length; i += 4) {
      const value = (i / 4 * 73) % 256;
      unrelatedBitmap[i] = value;
      unrelatedBitmap[i + 1] = 255 - value;
      unrelatedBitmap[i + 2] = (value * 3) % 256;
      unrelatedBitmap[i + 3] = 255;
    }
    const unrelated = patch(unrelatedBitmap);
    const comparison = comparePassiveTargetPatches(reference, unrelated)!;
    expect(passiveTargetPatchIsGrossMismatch(comparison)).toBe(true);
  });

  it('refuses to learn a clipped/offscreen target patch', () => {
    expect(samplePassiveTargetPatch(frame(200, 120, 80), { width: 200, height: 120 }, { width: 200, height: 120 }, { x: 4, y: 60, radius: 30 })).toBeUndefined();
  });
});
