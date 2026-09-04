export interface PassiveTargetPatch {
  size: number;
  pixels: Uint8Array;
  mean: number;
  ringMean: number;
}

export interface PassiveTargetPatchComparison {
  /** Mean absolute luminance difference after a tiny alignment search, 0..1. */
  difference: number;
  /** Fraction of canonical samples whose luminance changed materially, 0..1. */
  changedFraction: number;
  /** Current minus reference mean luminance in byte-space. */
  meanDelta: number;
  /** Current minus reference annulus luminance in byte-space. */
  ringDelta: number;
  similarity: number;
}

const PATCH_SIZE = 21;
const MATERIAL_PIXEL_DELTA = 20;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function luminance(bitmap: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const offset = (py * width + px) * 4;
  // Electron NativeImage bitmaps are BGRA on Windows. Averaging the three
  // colour channels deliberately makes channel order irrelevant and keeps the
  // watchdog stable across platform bitmap formats.
  return Math.round((bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2]) / 3);
}

function summarizePatch(size: number, pixels: Uint8Array): PassiveTargetPatch {
  let total = 0;
  let ringTotal = 0;
  let ringSamples = 0;
  const center = (size - 1) / 2;
  const maximum = Math.max(1, center);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = pixels[y * size + x];
      total += value;
      const radius = Math.hypot(x - center, y - center) / maximum;
      if (radius >= 0.42 && radius <= 0.94) {
        ringTotal += value;
        ringSamples += 1;
      }
    }
  }
  return {
    size,
    pixels,
    mean: total / Math.max(1, pixels.length),
    ringMean: ringTotal / Math.max(1, ringSamples),
  };
}

/**
 * Resample the exact projected target neighbourhood into a fixed-size patch.
 * The caller supplies display-local target coordinates and the reticle radius;
 * capture/display scaling is handled here so the same watchdog works at
 * 1080p, 1440p, ultrawide and 4K.
 */
export function samplePassiveTargetPatch(
  bitmap: Uint8Array,
  capture: { width: number; height: number },
  display: { width: number; height: number },
  target: { x: number; y: number; radius: number },
): PassiveTargetPatch | undefined {
  if (capture.width <= 0 || capture.height <= 0 || display.width <= 0 || display.height <= 0) return undefined;
  if (bitmap.length < capture.width * capture.height * 4) return undefined;
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.radius) || target.radius <= 0) return undefined;

  const captureX = target.x * capture.width / display.width;
  const captureY = target.y * capture.height / display.height;
  const radiusX = Math.max(3, target.radius * capture.width / display.width * 0.9);
  const radiusY = Math.max(3, target.radius * capture.height / display.height * 0.9);
  // Do not learn a clipped target. Offscreen guidance is handled in tree-space
  // and a partial patch is too easy to confuse with an unrelated edge.
  if (captureX - radiusX < 1 || captureY - radiusY < 1 || captureX + radiusX >= capture.width - 1 || captureY + radiusY >= capture.height - 1) return undefined;

  const pixels = new Uint8Array(PATCH_SIZE * PATCH_SIZE);
  const center = (PATCH_SIZE - 1) / 2;
  for (let y = 0; y < PATCH_SIZE; y += 1) {
    const ny = (y - center) / center;
    for (let x = 0; x < PATCH_SIZE; x += 1) {
      const nx = (x - center) / center;
      pixels[y * PATCH_SIZE + x] = luminance(bitmap, capture.width, capture.height, captureX + nx * radiusX, captureY + ny * radiusY);
    }
  }
  return summarizePatch(PATCH_SIZE, pixels);
}

function comparisonAtShift(reference: PassiveTargetPatch, current: PassiveTargetPatch, dx: number, dy: number): PassiveTargetPatchComparison | undefined {
  if (reference.size !== current.size || reference.size < 5) return undefined;
  const size = reference.size;
  let absolute = 0;
  let changed = 0;
  let samples = 0;
  for (let y = 1; y < size - 1; y += 1) {
    const cy = y + dy;
    if (cy < 0 || cy >= size) continue;
    for (let x = 1; x < size - 1; x += 1) {
      const cx = x + dx;
      if (cx < 0 || cx >= size) continue;
      const delta = Math.abs(reference.pixels[y * size + x] - current.pixels[cy * size + cx]);
      absolute += delta;
      if (delta >= MATERIAL_PIXEL_DELTA) changed += 1;
      samples += 1;
    }
  }
  if (!samples) return undefined;
  const difference = absolute / (samples * 255);
  return {
    difference,
    changedFraction: changed / samples,
    meanDelta: current.mean - reference.mean,
    ringDelta: current.ringMean - reference.ringMean,
    similarity: clamp(1 - difference, 0, 1),
  };
}

/** Compare patches while tolerating a one-canonical-pixel tracking quantization error. */
export function comparePassiveTargetPatches(reference: PassiveTargetPatch, current: PassiveTargetPatch): PassiveTargetPatchComparison | undefined {
  let best: PassiveTargetPatchComparison | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = comparisonAtShift(reference, current, dx, dy);
      if (!candidate) continue;
      if (!best || candidate.difference < best.difference) best = candidate;
    }
  }
  return best;
}

/**
 * A safe automatic progression signal. Hover/tooltip frames are excluded by
 * the service before this classifier is called. Allocation normally brightens
 * the node annulus; refund normally darkens it. A very strong persistent patch
 * change is accepted with a smaller directional requirement so unusual node
 * artwork does not disable the feature.
 */
export function passiveTargetOperationLooksComplete(
  comparison: PassiveTargetPatchComparison,
  operation: 'allocate' | 'refund',
): boolean {
  const material = comparison.difference >= 0.075 && comparison.changedFraction >= 0.12;
  if (!material) return false;
  const directionalDelta = operation === 'allocate' ? comparison.ringDelta : -comparison.ringDelta;
  if (directionalDelta >= 4) return true;
  return comparison.difference >= 0.14 && comparison.changedFraction >= 0.22 && directionalDelta >= 1.5;
}

/**
 * Gross disagreement is a watchdog signal only; it never picks another node.
 * Requiring very broad pixel churn distinguishes an unrelated neighbourhood
 * from the structured annulus change of an allocation/refund. The service
 * evaluates successful operation completion before this watchdog, so a valid
 * click cannot be reclassified as a camera mismatch.
 */
export function passiveTargetPatchIsGrossMismatch(comparison: PassiveTargetPatchComparison): boolean {
  return comparison.difference >= 0.22 && comparison.changedFraction >= 0.82;
}
