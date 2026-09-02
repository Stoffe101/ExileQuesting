import type { ScreenPoint } from './passive-tree-hud';

export interface PassiveNodeDetectionOptions {
  radii?: number[];
  angularSamples?: number;
  stride?: number;
  minimumContrast?: number;
  minimumCoverage?: number;
  maximumCandidates?: number;
}

interface ScoredCandidate extends ScreenPoint {
  score: number;
  radius: number;
  coverage: number;
}

const DEFAULT_RADII = [4, 6, 8, 10, 12, 15, 18, 22];
const MAX_CAPTURE_PIXELS = 4_000_000;

function gray(bitmap: Uint8Array, width: number, height: number, x: number, y: number): number {
  const px = Math.max(0, Math.min(width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(height - 1, Math.round(y)));
  const offset = (py * width + px) * 4;
  // NativeImage bitmap byte order is platform-native. Averaging RGB channels is
  // deliberately channel-order agnostic and is sufficient for radial contrast.
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
  const innerRadius = Math.max(1, radius - Math.max(1.25, radius * 0.16));
  const outerRadius = radius + Math.max(1.25, radius * 0.16);
  let contrastSum = 0;
  let covered = 0;
  let ringVarianceSum = 0;
  let previousRing = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const angle = sample * (Math.PI * 2 / samples);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ring = gray(bitmap, width, height, centerX + cos * radius, centerY + sin * radius);
    const inner = gray(bitmap, width, height, centerX + cos * innerRadius, centerY + sin * innerRadius);
    const outer = gray(bitmap, width, height, centerX + cos * outerRadius, centerY + sin * outerRadius);
    const contrast = Math.abs(ring - (inner + outer) / 2);
    contrastSum += contrast;
    if (contrast >= minimumContrast) covered += 1;
    if (sample > 0) ringVarianceSum += Math.abs(ring - previousRing);
    previousRing = ring;
  }
  const coverage = covered / samples;
  const meanContrast = contrastSum / samples;
  // Real passive-node frames are textured rather than mathematically perfect
  // circles. A tiny allowance for ring texture helps without accepting straight
  // edges, which have poor angular coverage.
  const textureBonus = Math.min(8, ringVarianceSum / Math.max(1, samples - 1) * 0.12);
  return { score: meanContrast * coverage + textureBonus, coverage };
}

function suppressNearby(candidates: ScoredCandidate[], maximumCandidates: number): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  for (const candidate of candidates.sort((left, right) => right.score - left.score)) {
    const suppressionRadius = Math.max(5, candidate.radius * 0.75);
    const collides = selected.some((existing) => {
      const distance = Math.hypot(candidate.x - existing.x, candidate.y - existing.y);
      return distance < Math.max(suppressionRadius, existing.radius * 0.75);
    });
    if (!collides) selected.push(candidate);
    if (selected.length >= maximumCandidates) break;
  }
  return selected;
}

/**
 * Finds repeated circular/radial features that are plausible passive nodes.
 * It intentionally does not classify node names or allocation state. The
 * stronger graph registration stage decides whether these circles form the
 * expected passive-tree constellation.
 */
export function detectPassiveTreeNodeCandidates(
  bitmap: Uint8Array,
  width: number,
  height: number,
  options: PassiveNodeDetectionOptions = {},
): ScreenPoint[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return [];
  if (width * height > MAX_CAPTURE_PIXELS || bitmap.length < width * height * 4) return [];
  const radii = (options.radii ?? DEFAULT_RADII).filter((radius) => Number.isFinite(radius) && radius >= 3 && radius <= Math.min(width, height) / 5);
  if (!radii.length) return [];
  const samples = Math.max(8, Math.min(24, Math.trunc(options.angularSamples ?? 12)));
  const stride = Math.max(2, Math.min(10, Math.trunc(options.stride ?? 4)));
  const minimumContrast = Math.max(4, Math.min(100, options.minimumContrast ?? 16));
  const minimumCoverage = Math.max(0.35, Math.min(1, options.minimumCoverage ?? 0.58));
  const maximumCandidates = Math.max(10, Math.min(300, Math.trunc(options.maximumCandidates ?? 140)));
  const margin = Math.ceil(Math.max(...radii) * 1.3 + 2);
  const candidates: ScoredCandidate[] = [];

  for (let y = margin; y < height - margin; y += stride) {
    for (let x = margin; x < width - margin; x += stride) {
      let best: ScoredCandidate | undefined;
      for (const radius of radii) {
        const radial = radialScore(bitmap, width, height, x, y, radius, samples, minimumContrast);
        if (radial.coverage < minimumCoverage || radial.score < minimumContrast * 0.5) continue;
        const candidate: ScoredCandidate = { x, y, score: radial.score, radius, coverage: radial.coverage };
        if (!best || candidate.score > best.score) best = candidate;
      }
      if (best) candidates.push(best);
    }
  }
  return suppressNearby(candidates, maximumCandidates).map(({ x, y, score, radius }) => ({ x, y, score, radius }));
}
