import {
  mapCapturePointToDisplay,
  passiveFixedNodePoint,
  projectPassiveTreePoint,
  type PassiveTreeTransform,
  type ScreenPoint,
  type TreePoint,
} from './passive-tree-hud';
import { indexPassiveNodes, passiveNodeScopeKey, type PassiveTreeSnapshot } from './passive-data';

export interface PassiveBootstrapCandidate extends ScreenPoint {
  score: number;
  radius: number;
}

export interface PassiveTreeBootstrapResult {
  transform: PassiveTreeTransform;
  inliers: number;
  rms: number;
  confidence: number;
  anchorRadiusRatio: number;
}

interface RadialCandidate extends PassiveBootstrapCandidate {
  coverage: number;
}

const MAX_CAPTURE_PIXELS = 4_000_000;
const DEFAULT_RADII = [3, 4, 5, 6, 8, 10, 12, 15, 18, 22];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function gray(bitmap: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const offset = (py * width + px) * 4;
  return (bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2]) / 3;
}

function radialScore(
  bitmap: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  samples: number,
  minimumContrast: number,
): { score: number; coverage: number } {
  const innerRadius = Math.max(1, radius - Math.max(1.1, radius * 0.17));
  const outerRadius = radius + Math.max(1.1, radius * 0.17);
  let contrastSum = 0;
  let covered = 0;
  let ringTexture = 0;
  let previous = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const angle = sample * Math.PI * 2 / samples;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ring = gray(bitmap, width, height, centerX + cos * radius, centerY + sin * radius);
    const inner = gray(bitmap, width, height, centerX + cos * innerRadius, centerY + sin * innerRadius);
    const outer = gray(bitmap, width, height, centerX + cos * outerRadius, centerY + sin * outerRadius);
    const contrast = Math.abs(ring - (inner + outer) / 2);
    contrastSum += contrast;
    if (contrast >= minimumContrast) covered += 1;
    if (sample) ringTexture += Math.abs(ring - previous);
    previous = ring;
  }
  const coverage = covered / samples;
  const score = contrastSum / samples * coverage + Math.min(7, ringTexture / Math.max(1, samples - 1) * 0.1);
  return { score, coverage };
}

function suppressNearby(candidates: RadialCandidate[], maximum: number): PassiveBootstrapCandidate[] {
  const selected: RadialCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.score - a.score || b.radius - a.radius)) {
    const collision = selected.some((existing) => Math.hypot(candidate.x - existing.x, candidate.y - existing.y) < Math.max(4, Math.min(candidate.radius, existing.radius) * 0.8));
    if (!collision) selected.push(candidate);
    if (selected.length >= maximum) break;
  }
  return selected.map(({ x, y, radius, score }) => ({ x, y, radius, score }));
}

/**
 * Restricted circle detector used only for first-time class/root bootstrap.
 * It is never used for steady-state target identity or camera tracking.
 */
export function detectPassiveBootstrapCandidates(
  bitmap: Uint8Array,
  width: number,
  height: number,
  options: { maximumCandidates?: number; stride?: number } = {},
): PassiveBootstrapCandidate[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return [];
  if (width * height > MAX_CAPTURE_PIXELS || bitmap.length < width * height * 4) return [];
  const radii = DEFAULT_RADII.filter((radius) => radius < Math.min(width, height) / 5);
  const maximum = clamp(Math.trunc(options.maximumCandidates ?? 120), 20, 180);
  const stride = clamp(Math.trunc(options.stride ?? 4), 2, 7);
  const margin = Math.ceil(Math.max(...radii) * 1.3 + 2);
  const result: RadialCandidate[] = [];
  for (let y = margin; y < height - margin; y += stride) {
    for (let x = margin; x < width - margin; x += stride) {
      let best: RadialCandidate | undefined;
      for (const radius of radii) {
        const radial = radialScore(bitmap, width, height, x, y, radius, 16, 13);
        if (radial.coverage < 0.62 || radial.score < 8.5) continue;
        const candidate: RadialCandidate = { x, y, radius, score: radial.score, coverage: radial.coverage };
        if (!best || candidate.score > best.score) best = candidate;
      }
      if (best) result.push(best);
    }
  }
  return suppressNearby(result, maximum);
}

/** Fixed local PoB/GGG graph around the known class/Ascendancy root. */
export function passiveBootstrapAnchors(
  snapshot: PassiveTreeSnapshot,
  anchorNodeId: number,
  depth = 3,
  maximum = 16,
): TreePoint[] {
  const nodes = indexPassiveNodes(snapshot);
  const anchorNode = nodes.get(anchorNodeId);
  const scope = passiveNodeScopeKey(anchorNode);
  const anchor = passiveFixedNodePoint(anchorNode);
  if (!scope || !anchor) return [];

  const reverse = new Map<number, number[]>();
  for (const node of nodes.values()) {
    if (passiveNodeScopeKey(node) !== scope) continue;
    for (const out of node.out ?? []) {
      const list = reverse.get(out) ?? [];
      list.push(node.id);
      reverse.set(out, list);
    }
  }

  const result: TreePoint[] = [anchor];
  const seen = new Set<number>([anchorNodeId]);
  let frontier = [anchorNodeId];
  for (let layer = 0; layer < depth && frontier.length && result.length < maximum; layer += 1) {
    const next: number[] = [];
    for (const id of frontier) {
      const node = nodes.get(id);
      const neighbours = [...(node?.out ?? []), ...(reverse.get(id) ?? [])];
      for (const neighbour of neighbours) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        const neighbourNode = nodes.get(neighbour);
        if (passiveNodeScopeKey(neighbourNode) !== scope) continue;
        const point = passiveFixedNodePoint(neighbourNode);
        if (!point) continue;
        result.push(point);
        next.push(neighbour);
        if (result.length >= maximum) break;
      }
      if (result.length >= maximum) break;
    }
    frontier = next;
  }
  return result;
}

function nearestUnused(
  expected: ScreenPoint,
  candidates: PassiveBootstrapCandidate[],
  used: Set<number>,
  tolerance: number,
): { index: number; candidate: PassiveBootstrapCandidate; distance: number } | undefined {
  let best: { index: number; candidate: PassiveBootstrapCandidate; distance: number } | undefined;
  for (let index = 0; index < candidates.length; index += 1) {
    if (used.has(index)) continue;
    const candidate = candidates[index];
    const distance = Math.hypot(candidate.x - expected.x, candidate.y - expected.y);
    if (distance > tolerance || (best && distance >= best.distance)) continue;
    best = { index, candidate, distance };
  }
  return best;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Bootstrap only translation at the deterministic maximum-zoom scale. The
 * known class/root node is required to be visually larger than its matched
 * local neighbours, and the entire PoB/GGG local geometry must agree. A unique
 * winner is mandatory. Failure simply leaves the manual emergency anchor.
 */
export function solvePassiveTreeBootstrap(
  anchor: TreePoint,
  localAnchors: TreePoint[],
  candidates: PassiveBootstrapCandidate[],
  scale: number,
  display: { width: number; height: number },
): PassiveTreeBootstrapResult | undefined {
  if (localAnchors.length < 6 || candidates.length < 8 || !Number.isFinite(scale) || scale <= 0) return undefined;
  const tolerance = clamp(display.height / 1080 * 9, 7, 16);
  const candidateMedianRadius = median(candidates.map((candidate) => candidate.radius));
  const anchorCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.radius >= Math.max(3, candidateMedianRadius * 1.08))
    .sort((a, b) => b.candidate.radius - a.candidate.radius || b.candidate.score - a.candidate.score)
    .slice(0, 24);
  if (!anchorCandidates.length) return undefined;

  const results: PassiveTreeBootstrapResult[] = [];
  for (const { candidate: anchorCandidate, index: anchorIndex } of anchorCandidates) {
    const transform: PassiveTreeTransform = {
      scale,
      offsetX: anchorCandidate.x - anchor.x * scale,
      offsetY: anchorCandidate.y - anchor.y * scale,
      ySign: 1,
    };
    const used = new Set<number>([anchorIndex]);
    const matchedRadii: number[] = [];
    const distances: number[] = [0];
    let inliers = 1;
    for (const tree of localAnchors) {
      if (tree.id === anchor.id) continue;
      const nearest = nearestUnused(projectPassiveTreePoint(transform, tree), candidates, used, tolerance);
      if (!nearest) continue;
      used.add(nearest.index);
      matchedRadii.push(nearest.candidate.radius);
      distances.push(nearest.distance);
      inliers += 1;
    }
    const minimumInliers = Math.max(6, Math.ceil(localAnchors.length * 0.58));
    if (inliers < minimumInliers || matchedRadii.length < 4) continue;
    const neighbourRadius = median(matchedRadii);
    const anchorRadiusRatio = anchorCandidate.radius / Math.max(1, neighbourRadius);
    if (anchorRadiusRatio < 1.12) continue;
    const rms = Math.sqrt(distances.reduce((sum, distance) => sum + distance * distance, 0) / distances.length);
    const coverage = inliers / localAnchors.length;
    const residual = 1 - clamp(rms / tolerance, 0, 1);
    const radiusEvidence = clamp((anchorRadiusRatio - 1.1) / 0.55, 0, 1);
    const confidence = clamp(coverage * 0.62 + residual * 0.25 + radiusEvidence * 0.13, 0, 1);
    if (confidence >= 0.78) results.push({ transform, inliers, rms, confidence, anchorRadiusRatio });
  }
  if (!results.length) return undefined;
  results.sort((a, b) => b.inliers - a.inliers || b.confidence - a.confidence || a.rms - b.rms);
  const best = results[0];
  const second = results[1];
  if (second && best.inliers - second.inliers < 2 && best.confidence - second.confidence < 0.1) return undefined;
  return best;
}

export function mapBootstrapCandidatesToDisplay(
  candidates: PassiveBootstrapCandidate[],
  capture: { width: number; height: number },
  display: { x: number; y: number; width: number; height: number },
): PassiveBootstrapCandidate[] {
  const radiusScale = ((display.width / capture.width) + (display.height / capture.height)) / 2;
  return candidates.map((candidate) => {
    const mapped = mapCapturePointToDisplay(candidate, capture, display);
    return {
      x: mapped.x - display.x,
      y: mapped.y - display.y,
      radius: candidate.radius * radiusScale,
      score: candidate.score,
    };
  });
}
