import { describe, expect, it } from 'vitest';
import { adaptPassiveTreeTransformToDisplay, passiveTreeTransformsAreDistinct } from './passive-tree-reference-bank';

describe('passive tree reference bank', () => {
  it('adapts the same trusted viewport from 1080p to 1440p', () => {
    const adapted = adaptPassiveTreeTransformToDisplay({
      transform: { scale: 0.108, offsetX: 980, offsetY: 550, ySign: 1 },
      displayWidth: 1920,
      displayHeight: 1080,
    }, { width: 2560, height: 1440 });
    expect(adapted).toBeDefined();
    expect(adapted!.scale).toBeCloseTo(0.144, 6);
    expect(adapted!.offsetX).toBeCloseTo(1306.6667, 3);
    expect(adapted!.offsetY).toBeCloseTo(733.3333, 3);
  });

  it('refuses to stretch a reference across a materially different aspect ratio', () => {
    expect(adaptPassiveTreeTransformToDisplay({
      transform: { scale: 0.108, offsetX: 960, offsetY: 540, ySign: 1 },
      displayWidth: 1920,
      displayHeight: 1080,
    }, { width: 3440, height: 1440 })).toBeUndefined();
  });

  it('keeps different zoom and pan views but rejects near-duplicates', () => {
    const display = { width: 3440, height: 1440 };
    const base = { scale: 0.144, offsetX: 1720, offsetY: 720, ySign: 1 as const };
    expect(passiveTreeTransformsAreDistinct(base, { ...base, offsetX: 1740, offsetY: 714 }, display)).toBe(false);
    expect(passiveTreeTransformsAreDistinct(base, { ...base, scale: 0.18 }, display)).toBe(true);
    expect(passiveTreeTransformsAreDistinct(base, { ...base, offsetX: 2050 }, display)).toBe(true);
  });
});
