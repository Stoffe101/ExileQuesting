import { describe, expect, it } from 'vitest';
import { applyPassiveTreeFrameMotion, trackPassiveTreeFrameMotion } from './passive-tree-frame-tracking';
import { PASSIVE_TREE_REAL_CLIENT_REPLAY_CASES, PASSIVE_TREE_REPLAY_DISPLAY_MATRIX } from './passive-tree-replay-corpus';
import { projectPassiveTreePoint, type PassiveTreeTransform } from './passive-tree-hud';

function clampByte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }

function texture(width: number, height: number): Uint8Array {
  const bitmap = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const radial = Math.sin(Math.hypot(x - width * 0.48, y - height * 0.52) * 0.145) * 31;
      const lines = Math.sin(x * 0.093) * 29 + Math.cos(y * 0.159) * 25 + Math.sin((x + y) * 0.067) * 19;
      const nodes = ((Math.floor(x / 29) * 13 + Math.floor(y / 23) * 31) % 9 === 0) ? 34 : 0;
      const value = clampByte(104 + radial + lines + nodes);
      const offset = (y * width + x) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  return bitmap;
}

function sample(source: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  return source[(py * width + px) * 4];
}

function transformed(source: Uint8Array, width: number, height: number, scale: number, residualPanX: number, residualPanY: number): Uint8Array {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const offsetX = centerX * (1 - scale) + residualPanX;
  const offsetY = centerY * (1 - scale) + residualPanY;
  const result = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = (x - offsetX) / scale;
      const sy = (y - offsetY) / scale;
      const value = sx >= 0 && sy >= 0 && sx < width && sy < height ? sample(source, width, height, sx, sy) : 18;
      const offset = (y * width + x) * 4;
      result[offset] = value;
      result[offset + 1] = value;
      result[offset + 2] = value;
      result[offset + 3] = 255;
    }
  }
  return result;
}

function expectedOffset(width: number, height: number, scale: number, panX: number, panY: number) {
  return {
    x: ((width - 1) / 2) * (1 - scale) + panX,
    y: ((height - 1) / 2) * (1 - scale) + panY,
  };
}

describe('sanitised real-client passive-tree replay corpus', () => {
  const width = 480;
  const height = 201;

  for (const replay of PASSIVE_TREE_REAL_CLIENT_REPLAY_CASES) {
    it(replay.id, () => {
      const previous = texture(width, height);
      const current = replay.stationary ? previous.slice() : transformed(previous, width, height, replay.scale, replay.residualPanX, replay.residualPanY);
      const result = trackPassiveTreeFrameMotion(previous, current, width, height, replay.wide ? { wide: true, searchRadiusPx: 104, minimumConfidence: 0.55 } : undefined);
      expect(result, replay.description).toBeDefined();
      expect(result!.scale).toBeCloseTo(replay.scale, replay.scale > 2 ? 0 : 1);
      const expected = expectedOffset(width, height, replay.scale, replay.residualPanX, replay.residualPanY);
      expect(result!.offsetX).toBeCloseTo(expected.x, -0.5);
      expect(result!.offsetY).toBeCloseTo(expected.y, -0.5);
      expect(Boolean(result!.stationary)).toBe(Boolean(replay.stationary));
    });
  }

  it.each(PASSIVE_TREE_REPLAY_DISPLAY_MATRIX)('keeps one immutable target coherent through the corpus on $label', (display) => {
    let transform: PassiveTreeTransform = {
      scale: display.height / 10_000,
      offsetX: display.width / 2,
      offsetY: display.height / 2,
      ySign: 1,
    };
    const target = { x: -167.5, y: -290.1185 };
    let projected = projectPassiveTreePoint(transform, target);
    expect(Number.isFinite(projected.x) && Number.isFinite(projected.y)).toBe(true);

    for (const replay of PASSIVE_TREE_REAL_CLIENT_REPLAY_CASES.filter((entry) => !entry.stationary && entry.scale <= 1.7)) {
      const offset = expectedOffset(width, height, replay.scale, replay.residualPanX, replay.residualPanY);
      transform = applyPassiveTreeFrameMotion(
        transform,
        { scale: replay.scale, offsetX: offset.x, offsetY: offset.y, confidence: 0.9, inliers: 18, rms: 1, stationary: false },
        { width, height },
        display,
      );
      projected = projectPassiveTreePoint(transform, target);
      expect(Number.isFinite(projected.x) && Number.isFinite(projected.y)).toBe(true);
      expect(transform.scale).toBeGreaterThan(0);
    }
  });
});
