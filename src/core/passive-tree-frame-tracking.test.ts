import { describe, expect, it } from 'vitest';
import { applyPassiveTreeFrameMotion, trackPassiveTreeFrameMotion } from './passive-tree-frame-tracking';
import type { PassiveTreeTransform } from './passive-tree-hud';

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function treeTexture(width: number, height: number, phase = 0): Uint8Array {
  const bitmap = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const centreX = x - width * 0.52;
      const centreY = y - height * 0.51;
      const radial = Math.sin(Math.hypot(centreX, centreY) * 0.17 + phase) * 24;
      const lattice = Math.sin(x * 0.113 + phase) * 35 + Math.cos(y * 0.173 - phase * 0.4) * 27;
      const diagonals = Math.sin((x + y) * 0.071 + phase * 1.7) * 19 + Math.cos((x - y) * 0.097) * 13;
      const nodeLike = ((Math.floor(x / 23) * 17 + Math.floor(y / 19) * 29) % 7 === 0) ? 28 : 0;
      const value = clampByte(112 + radial + lattice + diagonals + nodeLike);
      const offset = (y * width + x) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  return bitmap;
}

function gray(bitmap: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  return bitmap[(py * width + px) * 4];
}

function transformed(source: Uint8Array, width: number, height: number, scale: number, offsetX: number, offsetY: number): Uint8Array {
  const result = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x - offsetX) / scale;
      const sourceY = (y - offsetY) / scale;
      const value = sourceX >= 0 && sourceY >= 0 && sourceX < width && sourceY < height
        ? gray(source, width, height, sourceX, sourceY)
        : 18;
      const offset = (y * width + x) * 4;
      result[offset] = value;
      result[offset + 1] = value;
      result[offset + 2] = value;
      result[offset + 3] = 255;
    }
  }
  return result;
}

function occlude(bitmap: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * 4;
      bitmap[offset] = 232;
      bitmap[offset + 1] = 214;
      bitmap[offset + 2] = 180;
    }
  }
}

describe('passive tree frame motion', () => {
  const width = 240;
  const height = 120;

  it('reports identity when the passive tree is stationary', () => {
    const frame = treeTexture(width, height);
    const result = trackPassiveTreeFrameMotion(frame, frame, width, height);
    expect(result).toBeDefined();
    expect(result!.scale).toBeCloseTo(1, 2);
    expect(result!.offsetX).toBeCloseTo(0, 0);
    expect(result!.offsetY).toBeCloseTo(0, 0);
    expect(result!.confidence).toBeGreaterThan(0.8);
  });

  it('tracks a pan without re-identifying any passive node', () => {
    const previous = treeTexture(width, height);
    const current = transformed(previous, width, height, 1, 14, -8);
    const result = trackPassiveTreeFrameMotion(previous, current, width, height);
    expect(result).toBeDefined();
    expect(result!.scale).toBeCloseTo(1, 1);
    expect(result!.offsetX).toBeCloseTo(14, -0.5);
    expect(result!.offsetY).toBeCloseTo(-8, -0.5);
  });

  it('tracks zoom and pan together while keeping one immutable target space', () => {
    const previous = treeTexture(width, height);
    const current = transformed(previous, width, height, 1.06, -7, 4);
    const result = trackPassiveTreeFrameMotion(previous, current, width, height);
    expect(result).toBeDefined();
    expect(result!.scale).toBeCloseTo(1.06, 1);
    expect(result!.offsetX).toBeCloseTo(-7, 0);
    expect(result!.offsetY).toBeCloseTo(4, 0);
    expect(result!.inliers).toBeGreaterThanOrEqual(6);
  });

  it('stays locked through a tooltip-like occlusion', () => {
    const previous = treeTexture(width, height);
    const current = transformed(previous, width, height, 1, -10, 6);
    occlude(current, width, 92, 30, 155, 78);
    const result = trackPassiveTreeFrameMotion(previous, current, width, height);
    expect(result).toBeDefined();
    expect(result!.offsetX).toBeCloseTo(-10, -0.5);
    expect(result!.offsetY).toBeCloseTo(6, -0.5);
    expect(result!.inliers).toBeGreaterThanOrEqual(6);
  });

  it('fails closed on an unrelated tree image instead of inventing a jump', () => {
    const previous = treeTexture(width, height, 0);
    const unrelated = treeTexture(width, height, 2.37);
    expect(trackPassiveTreeFrameMotion(previous, unrelated, width, height)).toBeUndefined();
  });

  it('composes pan and zoom onto the immutable PoB tree transform', () => {
    const transform: PassiveTreeTransform = { scale: 0.144, offsetX: 1720, offsetY: 720, ySign: 1 };
    const next = applyPassiveTreeFrameMotion(
      transform,
      { scale: 1.12, offsetX: -24, offsetY: 9, confidence: 0.9, inliers: 20, rms: 1.2 },
      { width: 480, height: 201 },
      { width: 3440, height: 1440 },
    );
    expect(next.scale).toBeCloseTo(0.16128, 5);
    expect(next.offsetX).toBeCloseTo(1754.4, 1);
    expect(next.offsetY).toBeCloseTo(870.877612, 1);
    expect(next.ySign).toBe(1);
  });
});
