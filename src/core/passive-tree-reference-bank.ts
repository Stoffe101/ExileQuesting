import type { PassiveTreeTransform } from './passive-tree-hud';

export interface PassiveTreeReferenceGeometry {
  transform: PassiveTreeTransform;
  displayWidth: number;
  displayHeight: number;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Move a trusted tree-space transform between displays with the same viewport
 * aspect. PoE UI scale follows display height; offsets are preserved relative
 * to the viewport centre so 1080p/1440p/4K do not need separate node tables.
 */
export function adaptPassiveTreeTransformToDisplay(
  reference: PassiveTreeReferenceGeometry,
  target: { width: number; height: number },
): PassiveTreeTransform | undefined {
  if (!finitePositive(reference.displayWidth) || !finitePositive(reference.displayHeight) || !finitePositive(target.width) || !finitePositive(target.height)) return undefined;
  const sourceAspect = reference.displayWidth / reference.displayHeight;
  const targetAspect = target.width / target.height;
  if (Math.abs(targetAspect / sourceAspect - 1) > 0.025) return undefined;
  const ratio = target.height / reference.displayHeight;
  return {
    scale: reference.transform.scale * ratio,
    offsetX: target.width / 2 + (reference.transform.offsetX - reference.displayWidth / 2) * ratio,
    offsetY: target.height / 2 + (reference.transform.offsetY - reference.displayHeight / 2) * ratio,
    ySign: reference.transform.ySign,
  };
}

/** Keep a small bank of genuinely different pan/zoom views, not near-duplicates. */
export function passiveTreeTransformsAreDistinct(
  left: PassiveTreeTransform,
  right: PassiveTreeTransform,
  display: { width: number; height: number },
): boolean {
  if (!finitePositive(left.scale) || !finitePositive(right.scale)) return true;
  const scaleDistance = Math.abs(Math.log(left.scale / right.scale));
  const panDistance = Math.hypot(left.offsetX - right.offsetX, left.offsetY - right.offsetY);
  const viewport = Math.max(1, Math.min(display.width, display.height));
  return scaleDistance >= 0.11 || panDistance >= viewport * 0.11;
}
