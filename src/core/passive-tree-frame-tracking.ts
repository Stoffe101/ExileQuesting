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
  /** True only when the camera is confidently stationary. */
  stationary?: boolean;
}

export interface PassiveTreeFrameTrackingOptions {
  /** Maximum width used by the pure-JS matcher. The capture is downsampled when larger. */
  maximumWorkingWidth?: number;
  /** Expected frame-to-frame pan range in capture pixels. Zoom is solved separately around viewport centre. */
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
  meanPatchError: number;
}

const MAX_CAPTURE_PIXELS = 4_000_000;
const DEFAULT_WORKING_WIDTH = 240;
const DEFAULT_SEARCH_RADIUS = 78;
const PATCH_RADIUS = 4;
const MAX_FEATURES = 42;
const WIDE_MAX_FEATURES = 64;
const HYPOTHESIS_FEATURES = 26;
const MIN_TEXTURE = 22;
const MATCH_ERROR_LIMIT = 32;
const NORMAL_SCALE_FACTORS = [0.64, 0.72, 0.8, 0.88, 0.94, 1, 1.06, 1.14, 1.24, 1.36, 1.38, 1.5, 1.62, 1.64, 1.76];
const WIDE_SCALE_FACTORS = [0.48, 0.56, 0.64, 0.74, 0.84, 0.92, 1, 1.08, 1.18, 1.3, 1.38, 1.44, 1.6, 1.62, 1.76, 1.78, 1.98, 2.18, 2.25, 2.253];
const REFINED_HYPOTHESES = 3;

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

/**
 * A deliberately conservative cheap path for the overwhelmingly common case:
 * the player is reading the tree and the camera did not move. Local node glow,
 * cursor hover and tiny animated UI regions are allowed to change without
 * forcing the much more expensive scale-hypothesis solve.
 */
function framesAreStationary(previous: GrayFrame, current: GrayFrame): boolean {
  if (previous.width !== current.width || previous.height !== current.height) return false;
  const minX = Math.floor(previous.width * 0.06);
  const maxX = Math.ceil(previous.width * 0.94);
  const minY = Math.floor(previous.height * 0.18);
  const maxY = Math.ceil(previous.height * 0.88);
  let absolute = 0;
  let materiallyChanged = 0;
  let samples = 0;
  for (let y = minY; y < maxY; y += 2) {
    for (let x = minX; x < maxX; x += 2) {
      const delta = Math.abs(pixel(previous, x, y) - pixel(current, x, y));
      absolute += delta;
      if (delta >= 12) materiallyChanged += 1;
      samples += 1;
    }
  }
  if (!samples) return false;
  const meanDifference = absolute / samples;
  const changedFraction = materiallyChanged / samples;
  return meanDifference <= 0.9 && changedFraction <= 0.008;
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
function selectFeatures(frame: GrayFrame, maximumFeatures = MAX_FEATURES): FeaturePoint[] {
  const margin = PATCH_RADIUS + 4;
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
    if (selected.length >= maximumFeatures) break;
  }
  return selected;
}

function patchErrorAtScale(
  previous: GrayFrame,
  current: GrayFrame,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  scale: number,
): number {
  const roundedTargetX = Math.round(targetX);
  const roundedTargetY = Math.round(targetY);
  const sourceCenter = pixel(previous, sourceX, sourceY);
  const targetCenter = pixel(current, roundedTargetX, roundedTargetY);
  let sum = 0;
  let samples = 0;
  for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += 2) {
    for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += 2) {
      const currentX = Math.round(targetX + dx * scale);
      const currentY = Math.round(targetY + dy * scale);
      if (currentX < 0 || currentX >= current.width || currentY < 0 || currentY >= current.height) return Number.POSITIVE_INFINITY;
      const sourceValue = pixel(previous, sourceX + dx, sourceY + dy);
      const targetValue = pixel(current, currentX, currentY);
      const sourceRelative = sourceValue - sourceCenter;
      const targetRelative = targetValue - targetCenter;
      const relativeDifference = Math.abs(sourceRelative - targetRelative);
      const rawDifference = Math.abs(sourceValue - targetValue);
      sum += Math.min(64, relativeDifference) * 0.8 + Math.min(64, rawDifference) * 0.2;
      samples += 1;
    }
  }
  return samples ? sum / samples : Number.POSITIVE_INFINITY;
}

function expectedPointAtScale(frame: GrayFrame, source: FeaturePoint, scale: number): { x: number; y: number } {
  const centerX = (frame.width - 1) / 2;
  const centerY = (frame.height - 1) / 2;
  return {
    x: centerX + (source.x - centerX) * scale,
    y: centerY + (source.y - centerY) * scale,
  };
}

function matchFeatureAtScale(
  previous: GrayFrame,
  current: GrayFrame,
  source: FeaturePoint,
  scale: number,
  radius: number,
  preferredOffset?: { x: number; y: number },
): FeatureMatch | undefined {
  const scaledPatchMargin = Math.ceil(PATCH_RADIUS * Math.max(1, scale)) + 2;
  const expected = expectedPointAtScale(previous, source, scale);
  const expectedX = expected.x + (preferredOffset?.x ?? 0);
  const expectedY = expected.y + (preferredOffset?.y ?? 0);
  // Ordinary frame-to-frame zoom keeps a tight residual-pan window to reject
  // repeated tree artwork. Very large keyframe recovery can legitimately carry
  // a larger residual pan after downsampling (the real 2.25x case is ~15 px on
  // the working frame), so only extreme zoom hypotheses get the wider window.
  const preferredRadius = scale >= 1.9 ? 22 : 12;
  const searchRadius = preferredOffset ? Math.min(radius, preferredRadius) : radius;
  const coarseStep = preferredOffset ? 2 : searchRadius > 48 ? 5 : searchRadius > 30 ? 4 : 3;
  const minX = Math.max(scaledPatchMargin, Math.floor(expectedX - searchRadius));
  const maxX = Math.min(current.width - scaledPatchMargin - 1, Math.ceil(expectedX + searchRadius));
  const minY = Math.max(scaledPatchMargin, Math.floor(expectedY - searchRadius));
  const maxY = Math.min(current.height - scaledPatchMargin - 1, Math.ceil(expectedY + searchRadius));
  if (minX > maxX || minY > maxY) return undefined;

  let bestError = Number.POSITIVE_INFINITY;
  let bestX = Math.round(expectedX);
  let bestY = Math.round(expectedY);
  for (let y = minY; y <= maxY; y += coarseStep) {
    for (let x = minX; x <= maxX; x += coarseStep) {
      const error = patchErrorAtScale(previous, current, source.x, source.y, x, y, scale);
      if (error < bestError) {
        bestError = error;
        bestX = x;
        bestY = y;
      }
    }
  }

  const refineRadius = Math.max(2, coarseStep);
  for (let y = Math.max(minY, bestY - refineRadius); y <= Math.min(maxY, bestY + refineRadius); y += 1) {
    for (let x = Math.max(minX, bestX - refineRadius); x <= Math.min(maxX, bestX + refineRadius); x += 1) {
      const error = patchErrorAtScale(previous, current, source.x, source.y, x, y, scale);
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

function originOffset(match: FeatureMatch, scale: number): { x: number; y: number } {
  return {
    x: match.x - match.source.x * scale,
    y: match.y - match.source.y * scale,
  };
}

function residual(match: FeatureMatch, scale: number, offsetX: number, offsetY: number): number {
  return Math.hypot(match.source.x * scale + offsetX - match.x, match.source.y * scale + offsetY - match.y);
}

function dominantTranslation(matches: FeatureMatch[], scale: number, tolerance: number): WorkingMotion | undefined {
  if (matches.length < 4) return undefined;
  let bestInliers: FeatureMatch[] = [];
  let bestPatchError = Number.POSITIVE_INFINITY;

  for (const candidate of matches) {
    const offset = originOffset(candidate, scale);
    const inliers = matches.filter((match) => {
      const other = originOffset(match, scale);
      return Math.hypot(other.x - offset.x, other.y - offset.y) <= tolerance;
    });
    const patchError = inliers.length
      ? inliers.reduce((sum, match) => sum + match.error, 0) / inliers.length
      : Number.POSITIVE_INFINITY;
    if (inliers.length > bestInliers.length || (inliers.length === bestInliers.length && patchError < bestPatchError)) {
      bestInliers = inliers;
      bestPatchError = patchError;
    }
  }

  if (bestInliers.length < 4) return undefined;
  let offsetX = bestInliers.reduce((sum, match) => sum + originOffset(match, scale).x, 0) / bestInliers.length;
  let offsetY = bestInliers.reduce((sum, match) => sum + originOffset(match, scale).y, 0) / bestInliers.length;
  bestInliers = matches.filter((match) => residual(match, scale, offsetX, offsetY) <= tolerance);
  if (bestInliers.length < 4) return undefined;
  offsetX = bestInliers.reduce((sum, match) => sum + originOffset(match, scale).x, 0) / bestInliers.length;
  offsetY = bestInliers.reduce((sum, match) => sum + originOffset(match, scale).y, 0) / bestInliers.length;
  const rms = Math.sqrt(bestInliers.reduce((sum, match) => {
    const distance = residual(match, scale, offsetX, offsetY);
    return sum + distance * distance;
  }, 0) / bestInliers.length);
  const meanPatchError = bestInliers.reduce((sum, match) => sum + match.error, 0) / bestInliers.length;
  return { scale, offsetX, offsetY, inliers: bestInliers, rms, meanPatchError };
}

function refineScaleAndTranslation(matches: FeatureMatch[], seedScale: number): WorkingMotion | undefined {
  if (matches.length < 4) return undefined;
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
  const fittedScale = numerator / denominator;
  if (!finite(fittedScale) || fittedScale <= 0) return undefined;
  const maximumRefinement = Math.max(0.06, seedScale * 0.11);
  const scale = clamp(fittedScale, seedScale - maximumRefinement, seedScale + maximumRefinement);
  const offsetX = targetMeanX - sourceMeanX * scale;
  const offsetY = targetMeanY - sourceMeanY * scale;
  const tolerance = 5.5;
  const inliers = matches.filter((match) => residual(match, scale, offsetX, offsetY) <= tolerance);
  if (inliers.length < 4) return undefined;
  const refinedOffsetX = inliers.reduce((sum, match) => sum + originOffset(match, scale).x, 0) / inliers.length;
  const refinedOffsetY = inliers.reduce((sum, match) => sum + originOffset(match, scale).y, 0) / inliers.length;
  const rms = Math.sqrt(inliers.reduce((sum, match) => {
    const distance = residual(match, scale, refinedOffsetX, refinedOffsetY);
    return sum + distance * distance;
  }, 0) / inliers.length);
  const meanPatchError = inliers.reduce((sum, match) => sum + match.error, 0) / inliers.length;
  return { scale, offsetX: refinedOffsetX, offsetY: refinedOffsetY, inliers, rms, meanPatchError };
}

function hasUsefulSpread(motion: WorkingMotion, width: number, height: number): boolean {
  const xs = motion.inliers.map((match) => match.source.x);
  const ys = motion.inliers.map((match) => match.source.y);
  if (!xs.length || !ys.length) return false;
  const visibleSpreadFloor = Math.max(18, Math.min(width, height) * 0.5 / Math.max(1, motion.scale));
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= visibleSpreadFloor;
}

function hypothesisScore(motion: WorkingMotion, attemptedFeatures: number): number {
  // A zoom-in necessarily throws away old-frame area. Rank hypotheses against
  // the features that can physically remain visible, not every point sampled
  // from the old viewport, or a correct extreme recovery is unfairly buried.
  const visibleFraction = motion.scale > 1 ? 1 / (motion.scale * motion.scale) : 1;
  const visibleFeatureBudget = Math.max(4, attemptedFeatures * visibleFraction);
  const coverage = clamp(motion.inliers.length / visibleFeatureBudget, 0, 1);
  const residual = 1 - clamp(motion.rms / 5.5, 0, 1);
  const patch = 1 - clamp(motion.meanPatchError / MATCH_ERROR_LIMIT, 0, 1);
  return coverage * 0.64 + residual * 0.22 + patch * 0.14;
}

function solveScaleHypothesis(
  previous: GrayFrame,
  current: GrayFrame,
  features: FeaturePoint[],
  scale: number,
  searchRadius: number,
  centeredZoom = false,
): WorkingMotion | undefined {
  const preferredOffset = centeredZoom ? { x: 0, y: 0 } : undefined;
  const matches = features
    .map((feature) => matchFeatureAtScale(previous, current, feature, scale, searchRadius, preferredOffset))
    .filter((match): match is FeatureMatch => Boolean(match));
  const motion = dominantTranslation(matches, scale, 6);
  if (!motion || !hasUsefulSpread(motion, previous.width, previous.height)) return undefined;
  return motion;
}

function refineHypothesis(
  previous: GrayFrame,
  current: GrayFrame,
  allFeatures: FeaturePoint[],
  seed: WorkingMotion,
  searchRadius: number,
): WorkingMotion | undefined {
  const centerX = (previous.width - 1) / 2;
  const centerY = (previous.height - 1) / 2;
  const centeredOffset = {
    x: seed.offsetX - centerX * (1 - seed.scale),
    y: seed.offsetY - centerY * (1 - seed.scale),
  };
  const matches = allFeatures
    .map((feature) => matchFeatureAtScale(previous, current, feature, seed.scale, searchRadius, centeredOffset))
    .filter((match): match is FeatureMatch => Boolean(match));
  const clustered = dominantTranslation(matches, seed.scale, 5.5);
  if (!clustered) return seed;
  const refined = refineScaleAndTranslation(clustered.inliers, seed.scale) ?? clustered;
  return hasUsefulSpread(refined, previous.width, previous.height) ? refined : seed;
}

function confidenceForMotion(motion: WorkingMotion, availableFeatures: number, wide: boolean): number {
  const visibleFraction = motion.scale > 1 ? 1 / (motion.scale * motion.scale) : 1;
  const visibleFeatureBudget = Math.max(1, availableFeatures * visibleFraction);
  const coverage = clamp(motion.inliers.length / visibleFeatureBudget, 0, 1);
  const residualConfidence = 1 - clamp(motion.rms / (wide ? 6 : 5), 0, 1);
  const matchQuality = 1 - clamp(motion.meanPatchError / MATCH_ERROR_LIMIT, 0, 1);
  return clamp(coverage * 0.5 + residualConfidence * 0.32 + matchQuality * 0.18, 0, 1);
}

/**
 * Estimate only how the passive-tree canvas moved from one already-confirmed
 * passive-tree frame to the next. It never receives node IDs and therefore can
 * never change the logical target. Zoom is explicitly modeled around the
 * viewport centre so aggressive mouse-wheel changes do not masquerade as huge
 * translations. A bad estimate fails closed instead of moving the target to a
 * plausible-looking unrelated passive.
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

  if (framesAreStationary(previous, current)) {
    return { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.995, inliers: 0, rms: 0, stationary: true };
  }

  // Ordinary frame-to-frame tracking stays on the smaller feature budget for
  // performance. Wide/keyframe recovery deliberately samples more spatially
  // distributed anchors because extreme zoom can crop most of the old frame.
  const features = selectFeatures(previous, options.wide ? WIDE_MAX_FEATURES : MAX_FEATURES);
  if (features.length < 8) return undefined;

  const requestedRadius = Math.max(18, options.searchRadiusPx ?? DEFAULT_SEARCH_RADIUS);
  const workingRequestedRadius = requestedRadius / Math.max(1, previous.scaleX);
  const minimumRadius = previous.width * (options.wide ? 0.38 : 0.27);
  const maximumRadius = previous.width * (options.wide ? 0.5 : 0.4);
  const searchRadius = Math.round(clamp(Math.max(workingRequestedRadius, minimumRadius), 12, maximumRadius));

  const fast = solveScaleHypothesis(previous, current, features, 1, searchRadius);
  if (fast) {
    const fastConfidence = confidenceForMotion(fast, features.length, Boolean(options.wide));
    const fastMinimumInliers = Math.max(7, Math.ceil(features.length * 0.4));
    if (fast.inliers.length >= fastMinimumInliers && fastConfidence >= 0.68) {
      const offsetX = fast.offsetX * previous.scaleX;
      const offsetY = fast.offsetY * previous.scaleY;
      return {
        scale: fast.scale,
        offsetX,
        offsetY,
        confidence: fastConfidence,
        inliers: fast.inliers.length,
        rms: fast.rms * (previous.scaleX + previous.scaleY) / 2,
        stationary: Math.abs(offsetX) <= 1.25 && Math.abs(offsetY) <= 1.25,
      };
    }
  }

  // Wide/keyframe recovery must consider every available feature because a
  // large zoom can physically crop most of the previous frame. Restricting the
  // hypothesis pass to the top 26 texture points can leave fewer than four
  // still-visible centre features even when the transform is perfectly valid.
  const hypothesisFeatures = options.wide
    ? features
    : features.slice(0, Math.min(features.length, HYPOTHESIS_FEATURES));
  const scaleFactors = options.wide ? WIDE_SCALE_FACTORS : NORMAL_SCALE_FACTORS;
  const seeds: Array<{ motion: WorkingMotion; score: number }> = [];
  for (const scale of scaleFactors) {
    if (scale === 1) continue;
    const motion = solveScaleHypothesis(previous, current, hypothesisFeatures, scale, searchRadius, true);
    if (!motion) continue;
    seeds.push({ motion, score: hypothesisScore(motion, hypothesisFeatures.length) });
  }
  if (!seeds.length) return undefined;

  seeds.sort((left, right) => right.score - left.score || right.motion.inliers.length - left.motion.inliers.length || left.motion.rms - right.motion.rms);
  let selected: WorkingMotion | undefined;
  let selectedConfidence = -1;
  for (const seed of seeds.slice(0, REFINED_HYPOTHESES)) {
    const refined = refineHypothesis(previous, current, features, seed.motion, searchRadius);
    if (!refined) continue;
    const confidence = confidenceForMotion(refined, features.length, Boolean(options.wide));
    if (!selected || confidence > selectedConfidence
      || (Math.abs(confidence - selectedConfidence) < 1e-6 && refined.inliers.length > selected.inliers.length)
      || (Math.abs(confidence - selectedConfidence) < 1e-6 && refined.inliers.length === selected.inliers.length && refined.rms < selected.rms)) {
      selected = refined;
      selectedConfidence = confidence;
    }
  }
  if (!selected) return undefined;

  const visibleFraction = selected.scale > 1 ? 1 / (selected.scale * selected.scale) : 1;
  const physicalVisibleBudget = features.length * visibleFraction;
  const visibilityRetention = options.wide && selected.scale >= 2 ? 0.5 : 0.7;
  const adaptiveDefaultMinimum = Math.max(6, Math.ceil(Math.min(features.length * 0.28, physicalVisibleBudget * visibilityRetention)));
  const minimumInliers = Math.max(6, Math.trunc(options.minimumInliers ?? adaptiveDefaultMinimum));
  if (selected.inliers.length < minimumInliers) return undefined;
  const minimumConfidence = clamp(options.minimumConfidence ?? (options.wide ? 0.55 : 0.6), 0, 1);
  if (selectedConfidence < minimumConfidence) return undefined;

  // Integer feature coordinates can bias the least-squares scale slightly even
  // when a nearby centred-zoom hypothesis already describes the image better.
  // Snap only very small (<1.2%) refinements to the nearest proven hypothesis,
  // preserving the independently measured residual pan around viewport centre.
  const nearestScale = scaleFactors.reduce((best, candidate) => (
    Math.abs(candidate - selected!.scale) < Math.abs(best - selected!.scale) ? candidate : best
  ), scaleFactors[0]);
  const shouldSnapScale = Math.abs(nearestScale - selected.scale) / Math.max(0.001, selected.scale) <= 0.012;
  let outputScale = selected.scale;
  let outputOffsetX = selected.offsetX;
  let outputOffsetY = selected.offsetY;
  if (shouldSnapScale) {
    const centerX = (previous.width - 1) / 2;
    const centerY = (previous.height - 1) / 2;
    const residualPanX = selected.offsetX - centerX * (1 - selected.scale);
    const residualPanY = selected.offsetY - centerY * (1 - selected.scale);
    outputScale = nearestScale;
    outputOffsetX = centerX * (1 - outputScale) + residualPanX;
    outputOffsetY = centerY * (1 - outputScale) + residualPanY;
  }

  return {
    scale: outputScale,
    offsetX: outputOffsetX * previous.scaleX,
    offsetY: outputOffsetY * previous.scaleY,
    confidence: selectedConfidence,
    inliers: selected.inliers.length,
    rms: selected.rms * (previous.scaleX + previous.scaleY) / 2,
    stationary: false,
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