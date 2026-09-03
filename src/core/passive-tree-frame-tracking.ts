import type { PassiveTreeTransform } from './passive-tree-hud';

export interface PassiveTreeFrameMotion {
  /** Uniform scale from the previous capture into the current capture. */
  scale: number;
  /** Capture-space translation after scale is applied around capture origin. */
  offsetX: number;
  offsetY: number;
  confidence: number;
  inliers: number;
  rms: number;
}

export interface PassiveTreeFrameTrackingOptions {
  /** Maximum width used by the pure-JS matcher. The capture is downsampled when larger. */
  maximumWorkingWidth?: number;
  /** Maximum frame-to-frame displacement in capture pixels. */
  searchRadiusPx?: number;
  /** Allow a wider scale/displacement range for reopening/recovery. */
  wide?: boolean;
  minimumInliers?: number;
  minimumConfidence?: number;
}

interface GrayFrame {
  data: Uint8Array;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

interface FeaturePoint {
  x: number;
  y: number;
  texture: number;
}

interface FeatureMatch {
  source: FeaturePoint;
  x: number;
  y: number;
  error: number;
}

interface WorkingMotion {
  scale: number;
  offsetX: number;
  offsetY: number;
  inliers: FeatureMatch[];
  rms: number;
}

const MAX_CAPTURE_PIXELS = 4_000_000;
const DEFAULT_WORKING_WIDTH = 240;
const DEFAULT_SEARCH_RADIUS = 78;
const PATCH_RADIUS = 5;
const MAX_FEATURES = 52;
const MIN_TEXTURE = 24;
const MATCH_ERROR_LIMIT = 29;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function toGray(bitmap: Uint8Array, width: number, height: number, maximumWorkingWidth: number): GrayFrame | undefined {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return undefined;
  if (width * height > MAX_CAPTURE_PIXELS || bitmap.length < width * height * 4) return undefined;
  const targetWidth = Math.max(120, Math.min(width, Math.trunc(maximumWorkingWidth)));
  const factor = Math.max(1, Math.ceil(width / targetWidth));
  const workingWidth = Math.max(1, Math.floor(width / factor));
  const workingHeight = Math.max(1, Math.floor(height / factor));
  const data = new Uint8Array(workingWidth * workingHeight);

  for (let y = 0; y < workingHeight; y += 1) {
    const sourceY0 = Math.floor(y * height / workingHeight);
    const sourceY1 = Math.max(sourceY0 + 1, Math.floor((y + 1) * height / workingHeight));
    for (let x = 0; x < workingWidth; x += 1) {
      const sourceX0 = Math.floor(x * width / workingWidth);
      const sourceX1 = Math.max(sourceX0 + 1, Math.floor((x + 1) * width / workingWidth));
      let sum = 0;
      let count = 0;
      for (let sourceY = sourceY0; sourceY < Math.min(height, sourceY1); sourceY += 1) {
        for (let sourceX = sourceX0; sourceX < Math.min(width, sourceX1); sourceX += 1) {
          const offset = (sourceY * width + sourceX) * 4;
          sum += bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2];
          count += 3;
        }
      }
      data[y * workingWidth + x] = count ? Math.round(sum / count) : 0;
    }
  }

  return {
    data,
    width: workingWidth,
    height: workingHeight,
    scaleX: width / workingWidth,
    scaleY: height / workingHeight,
  };
}

function pixel(frame: GrayFrame, x: number, y: number): number {
  return frame.data[y * frame.width + x];
}

function textureScore(frame: GrayFrame, x: number, y: number): number {
  const left = pixel(frame, x - 2, y);
  const right = pixel(frame, x + 2, y);
  const up = pixel(frame, x, y - 2);
  const down = pixel(frame, x, y + 2);
  const diagonalA = pixel(frame, x - 2, y - 2);
  const diagonalB = pixel(frame, x + 2, y + 2);
  return Math.abs(right - left) + Math.abs(down - up) + Math.abs(diagonalB - diagonalA) * 0.55;
}

/**
 * Pick textured points across the moving tree canvas, deliberately excluding
 * the mostly-static top/bottom PoE controls. These points have no passive-node
 * identity. They only describe how the already-known tree image moved.
 */
function selectFeatures(frame: GrayFrame): FeaturePoint[] {
  const margin = PATCH_RADIUS + 3;
  const minX = Math.max(margin, Math.floor(frame.width * 0.06));
  const maxX = Math.min(frame.width - margin - 1, Math.ceil(frame.width * 0.94));
  const minY = Math.max(margin, Math.floor(frame.height * 0.18));
  const maxY = Math.min(frame.height - margin - 1, Math.ceil(frame.height * 0.88));
  const cell = Math.max(12, Math.round(Math.min(frame.width, frame.height) / 6.5));
  const candidates: FeaturePoint[] = [];

  for (let top = minY; top <= maxY; top += cell) {
    for (let left = minX; left <= maxX; left += cell) {
      let best: FeaturePoint | undefined;
      const bottom = Math.min(maxY, top + cell - 1);
      const right = Math.min(maxX, left + cell - 1);
      for (let y = top + 2; y <= bottom - 2; y += 3) {
        for (let x = left + 2; x <= right - 2; x += 3) {
          const texture = textureScore(frame, x, y);
          if (texture >= MIN_TEXTURE && (!best || texture > best.texture)) best = { x, y, texture };
        }
      }
      if (best) candidates.push(best);
    }
  }

  candidates.sort((left, right) => right.texture - left.texture);
  const selected: FeaturePoint[] = [];
  for (const candidate of candidates) {
    if (selected.some((existing) => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) < 9)) continue;
    selected.push(candidate);
    if (selected.length >= MAX_FEATURES) break;
  }
  return selected;
}

function patchError(previous: GrayFrame, current: GrayFrame, sourceX: number, sourceY: number, targetX: number, targetY: number): number {
  const sourceCenter = pixel(previous, sourceX, sourceY);
  const targetCenter = pixel(current, targetX, targetY);
  let sum = 0;
  let samples = 0;
  for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += 2) {
    for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += 2) {
      const sourceRelative = pixel(previous, sourceX + dx, sourceY + dy) - sourceCenter;
      const targetRelative = pixel(current, targetX + dx, targetY + dy) - targetCenter;
      const relativeDifference = Math.abs(sourceRelative - targetRelative);
      const rawDifference = Math.abs(pixel(previous, sourceX + dx, sourceY + dy) - pixel(current, targetX + dx, targetY + dy));
      sum += Math.min(64, relativeDifference) * 0.78 + Math.min(64, rawDifference) * 0.22;
      samples += 1;
    }
  }
  return samples ? sum / samples : Number.POSITIVE_INFINITY;
}

function matchFeature(previous: GrayFrame, current: GrayFrame, source: FeaturePoint, radius: number): FeatureMatch | undefined {
  const margin = PATCH_RADIUS + 1;
  const coarseStep = radius > 34 ? 3 : 2;
  let bestError = Number.POSITIVE_INFINITY;
  let bestX = source.x;
  let bestY = source.y;
  const minX = Math.max(margin, source.x - radius);
  const maxX = Math.min(current.width - margin - 1, source.x + radius);
  const minY = Math.max(margin, source.y - radius);
  const maxY = Math.min(current.height - margin - 1, source.y + radius);

  for (let y = minY; y <= maxY; y += coarseStep) {
    for (let x = minX; x <= maxX; x += coarseStep) {
      const error = patchError(previous, current, source.x, source.y, x, y);
      if (error < bestError) {
        bestError = error;
        bestX = x;
        bestY = y;
      }
    }
  }

  const refineRadius = Math.max(2, coarseStep);
  for (let y = Math.max(margin, bestY - refineRadius); y <= Math.min(current.height - margin - 1, bestY + refineRadius); y += 1) {
    for (let x = Math.max(margin, bestX - refineRadius); x <= Math.min(current.width - margin - 1, bestX + refineRadius); x += 1) {
      const error = patchError(previous, current, source.x, source.y, x, y);
      if (error < bestError) {
        bestError = error;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (!finite(bestError) || bestError > MATCH_ERROR_LIMIT) return undefined;
  return { source, x: bestX, y: bestY, error: bestError };
}

function residual(match: FeatureMatch, scale: number, offsetX: number, offsetY: number): number {
  return Math.hypot(match.source.x * scale + offsetX - match.x, match.source.y * scale + offsetY - match.y);
}

function refineMotion(matches: FeatureMatch[]): { scale: number; offsetX: number; offsetY: number } | undefined {
  if (matches.length < 2) return undefined;
  const sourceMeanX = matches.reduce((sum, match) => sum + match.source.x, 0) / matches.length;
  const sourceMeanY = matches.reduce((sum, match) => sum + match.source.y, 0) / matches.length;
  const targetMeanX = matches.reduce((sum, match) => sum + match.x, 0) / matches.length;
  const targetMeanY = matches.reduce((sum, match) => sum + match.y, 0) / matches.length;
  let numerator = 0;
  let denominator = 0;
  for (const match of matches) {
    const sourceX = match.source.x - sourceMeanX;
    const sourceY = match.source.y - sourceMeanY;
    numerator += sourceX * (match.x - targetMeanX) + sourceY * (match.y - targetMeanY);
    denominator += sourceX * sourceX + sourceY * sourceY;
  }
  if (denominator <= 1e-6) return undefined;
  const scale = numerator / denominator;
  if (!finite(scale) || scale <= 0) return undefined;
  return {
    scale,
    offsetX: targetMeanX - sourceMeanX * scale,
    offsetY: targetMeanY - sourceMeanY * scale,
  };
}

function candidateFromPair(left: FeatureMatch, right: FeatureMatch): { scale: number; offsetX: number; offsetY: number; rotationError: number } | undefined {
  const sourceX = right.source.x - left.source.x;
  const sourceY = right.source.y - left.source.y;
  const targetX = right.x - left.x;
  const targetY = right.y - left.y;
  const denominator = sourceX * sourceX + sourceY * sourceY;
  if (denominator < 18 * 18) return undefined;
  const scale = (sourceX * targetX + sourceY * targetY) / denominator;
  if (!finite(scale) || scale <= 0) return undefined;
  const rotationError = Math.abs(sourceX * targetY - sourceY * targetX) / denominator;
  return {
    scale,
    offsetX: ((left.x - left.source.x * scale) + (right.x - right.source.x * scale)) / 2,
    offsetY: ((left.y - left.source.y * scale) + (right.y - right.source.y * scale)) / 2,
    rotationError,
  };
}

function fitMotion(matches: FeatureMatch[], width: number, height: number, wide: boolean): WorkingMotion | undefined {
  if (matches.length < 4) return undefined;
  const minimumScale = wide ? 0.58 : 0.76;
  const maximumScale = wide ? 1.72 : 1.32;
  const rotationLimit = wide ? 0.12 : 0.085;
  const inlierTolerance = wide ? 5.5 : 4.25;
  let best: WorkingMotion | undefined;

  for (let leftIndex = 0; leftIndex < matches.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < matches.length; rightIndex += 1) {
      const proposal = candidateFromPair(matches[leftIndex], matches[rightIndex]);
      if (!proposal || proposal.scale < minimumScale || proposal.scale > maximumScale || proposal.rotationError > rotationLimit) continue;
      const inliers = matches.filter((match) => residual(match, proposal.scale, proposal.offsetX, proposal.offsetY) <= inlierTolerance);
      if (inliers.length < 4) continue;
      const rms = Math.sqrt(inliers.reduce((sum, match) => {
        const distance = residual(match, proposal.scale, proposal.offsetX, proposal.offsetY);
        return sum + distance * distance;
      }, 0) / inliers.length);
      if (!best || inliers.length > best.inliers.length || (inliers.length === best.inliers.length && rms < best.rms)) {
        best = { ...proposal, inliers, rms };
      }
    }
  }

  if (!best) return undefined;
  const refined = refineMotion(best.inliers);
  if (!refined || refined.scale < minimumScale || refined.scale > maximumScale) return undefined;
  const finalInliers = matches.filter((match) => residual(match, refined.scale, refined.offsetX, refined.offsetY) <= inlierTolerance);
  if (finalInliers.length < 4) return undefined;
  const finalRefined = refineMotion(finalInliers);
  if (!finalRefined || finalRefined.scale < minimumScale || finalRefined.scale > maximumScale) return undefined;
  const rms = Math.sqrt(finalInliers.reduce((sum, match) => {
    const distance = residual(match, finalRefined.scale, finalRefined.offsetX, finalRefined.offsetY);
    return sum + distance * distance;
  }, 0) / finalInliers.length);

  const xs = finalInliers.map((match) => match.source.x);
  const ys = finalInliers.map((match) => match.source.y);
  const spread = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (spread < Math.min(width, height) * 0.55) return undefined;
  return { ...finalRefined, inliers: finalInliers, rms };
}

/**
 * Estimate only how the passive-tree canvas moved from one already-confirmed
 * passive-tree frame to the next. It never receives node IDs and therefore can
 * never change the logical target. A bad estimate fails closed instead of
 * jumping the target crosshair to another plausible passive circle.
 */
export function trackPassiveTreeFrameMotion(
  previousBitmap: Uint8Array,
  currentBitmap: Uint8Array,
  width: number,
  height: number,
  options: PassiveTreeFrameTrackingOptions = {},
): PassiveTreeFrameMotion | undefined {
  const maximumWorkingWidth = clamp(Math.trunc(options.maximumWorkingWidth ?? DEFAULT_WORKING_WIDTH), 120, 360);
  const previous = toGray(previousBitmap, width, height, maximumWorkingWidth);
  const current = toGray(currentBitmap, width, height, maximumWorkingWidth);
  if (!previous || !current || previous.width !== current.width || previous.height !== current.height) return undefined;
  const features = selectFeatures(previous);
  if (features.length < 6) return undefined;
  const originalSearchRadius = Math.max(18, options.searchRadiusPx ?? DEFAULT_SEARCH_RADIUS) * (options.wide ? 1.45 : 1);
  const workingSearchRadius = Math.max(7, Math.round(originalSearchRadius / previous.scaleX));
  const matches = features
    .map((feature) => matchFeature(previous, current, feature, workingSearchRadius))
    .filter((match): match is FeatureMatch => Boolean(match));
  if (matches.length < 4) return undefined;

  const fitted = fitMotion(matches, previous.width, previous.height, Boolean(options.wide));
  if (!fitted) return undefined;
  const minimumInliers = Math.max(4, Math.trunc(options.minimumInliers ?? Math.max(6, Math.ceil(matches.length * 0.34))));
  if (fitted.inliers.length < minimumInliers) return undefined;
  const inlierRatio = fitted.inliers.length / Math.max(1, matches.length);
  const residualConfidence = 1 - clamp(fitted.rms / (options.wide ? 5.5 : 4.25), 0, 1);
  const matchQuality = 1 - clamp(fitted.inliers.reduce((sum, match) => sum + match.error, 0) / fitted.inliers.length / MATCH_ERROR_LIMIT, 0, 1);
  const confidence = clamp(inlierRatio * 0.56 + residualConfidence * 0.28 + matchQuality * 0.16, 0, 1);
  const minimumConfidence = clamp(options.minimumConfidence ?? (options.wide ? 0.56 : 0.6), 0, 1);
  if (confidence < minimumConfidence) return undefined;

  return {
    scale: fitted.scale,
    offsetX: fitted.offsetX * previous.scaleX,
    offsetY: fitted.offsetY * previous.scaleY,
    confidence,
    inliers: fitted.inliers.length,
    rms: fitted.rms * (previous.scaleX + previous.scaleY) / 2,
  };
}

/** Compose capture-space frame motion with the trusted PoB tree-to-screen transform. */
export function applyPassiveTreeFrameMotion(
  transform: PassiveTreeTransform,
  motion: PassiveTreeFrameMotion,
  capture: { width: number; height: number },
  display: { width: number; height: number },
): PassiveTreeTransform {
  const scaleX = display.width / Math.max(1, capture.width);
  const scaleY = display.height / Math.max(1, capture.height);
  return {
    scale: transform.scale * motion.scale,
    offsetX: transform.offsetX * motion.scale + motion.offsetX * scaleX,
    offsetY: transform.offsetY * motion.scale + motion.offsetY * scaleY,
    ySign: transform.ySign,
  };
}
