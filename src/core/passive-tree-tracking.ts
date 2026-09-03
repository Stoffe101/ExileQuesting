import {
  projectPassiveTreePoint,
  solvePassiveTreeTransform,
  type PassiveTreeMatch,
  type PassiveTreeRegistration,
  type PassiveTreeTransform,
  type ScreenPoint,
  type TreePoint,
} from './passive-tree-hud';

export interface PassiveTreeTrackingOptions {
  tolerancePx?: number;
  voteCellPx?: number;
  minimumInliers?: number;
  maximumCandidates?: number;
  maximumAnchors?: number;
  maximumOffsetShiftPx?: number;
  scaleFactors?: number[];
  hypothesesPerScale?: number;
  minimumScale?: number;
  maximumScale?: number;
  minimumScaleRatio?: number;
  maximumScaleRatio?: number;
  minimumConfidence?: number;
  maximumRmsRatio?: number;
  /**
   * Registration often uses more known PoB nodes than are visible at once.
   * Cap the support denominator so a strong visible constellation is not
   * punished merely because the local tracker carries extra nearby anchors.
   */
  confidenceAnchorCap?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(left: ScreenPoint, right: ScreenPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function nearestUniqueMatches(
  transform: PassiveTreeTransform,
  anchors: TreePoint[],
  candidates: ScreenPoint[],
  tolerancePx: number,
): PassiveTreeMatch[] {
  const available = new Set(candidates.map((_candidate, index) => index));
  const matches: PassiveTreeMatch[] = [];
  for (const tree of anchors) {
    const projected = projectPassiveTreePoint(transform, tree);
    let bestIndex = -1;
    let bestDistance = tolerancePx;
    for (const index of available) {
      const current = distance(projected, candidates[index]);
      if (current <= bestDistance) {
        bestDistance = current;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) continue;
    available.delete(bestIndex);
    matches.push({ tree, screen: candidates[bestIndex], distance: bestDistance });
  }
  return matches;
}

function registrationConfidence(
  matches: PassiveTreeMatch[],
  anchorCount: number,
  tolerancePx: number,
  confidenceAnchorCap: number,
): number {
  if (!matches.length || !anchorCount) return 0;
  const rms = Math.sqrt(matches.reduce((sum, match) => sum + match.distance * match.distance, 0) / matches.length);
  const effectiveAnchorCount = Math.max(matches.length, Math.min(anchorCount, confidenceAnchorCap));
  const ratio = matches.length / effectiveAnchorCount;
  const residual = 1 - clamp(rms / Math.max(1, tolerancePx), 0, 1);
  const xs = matches.map((match) => match.tree.x);
  const ys = matches.map((match) => match.tree.y);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  const spread = clamp(Math.hypot(spreadX, spreadY) / 1800, 0.2, 1);
  return clamp(ratio * 0.52 + residual * 0.33 + spread * 0.15, 0, 1);
}

interface OffsetVote {
  count: number;
  sumX: number;
  sumY: number;
}

function offsetHypotheses(
  anchors: TreePoint[],
  candidates: ScreenPoint[],
  previous: PassiveTreeTransform,
  scale: number,
  voteCellPx: number,
  maximumOffsetShiftPx: number,
  limit: number,
): Array<{ offsetX: number; offsetY: number }> {
  const votes = new Map<string, OffsetVote>();
  for (const tree of anchors) {
    const scaledX = tree.x * scale;
    const scaledY = tree.y * scale * previous.ySign;
    for (const candidate of candidates) {
      const offsetX = candidate.x - scaledX;
      const offsetY = candidate.y - scaledY;
      if (Math.abs(offsetX - previous.offsetX) > maximumOffsetShiftPx
        || Math.abs(offsetY - previous.offsetY) > maximumOffsetShiftPx) continue;
      const key = `${Math.round(offsetX / voteCellPx)}:${Math.round(offsetY / voteCellPx)}`;
      const vote = votes.get(key) ?? { count: 0, sumX: 0, sumY: 0 };
      vote.count += 1;
      vote.sumX += offsetX;
      vote.sumY += offsetY;
      votes.set(key, vote);
    }
  }
  return [...votes.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((vote) => ({ offsetX: vote.sumX / vote.count, offsetY: vote.sumY / vote.count }));
}

/**
 * Track an already-known PoB passive-tree constellation through pan and zoom.
 *
 * This function never decides whether the passive tree is open. The caller must
 * establish that separately. It only solves scale + translation for a bounded,
 * local tree constellation against already-detected passive-node centres.
 * Keeping the anchor set local is a correctness boundary: feeding hundreds of
 * anonymous tree nodes to a dense circle cloud can manufacture plausible but
 * wrong transforms, which is explicitly rejected here.
 *
 * A registration with no inliers is treated as an unverified seed, not a real
 * zoom measurement. The first lock therefore searches a wider scale range so
 * initial setup can happen at the player's current zoom. After real inliers
 * exist, tracking returns to the tighter previous-frame search.
 */
export function trackPassiveTreeRegistration(
  previous: PassiveTreeRegistration,
  anchors: TreePoint[],
  rawCandidates: ScreenPoint[],
  options: PassiveTreeTrackingOptions = {},
): PassiveTreeRegistration | undefined {
  const maximumAnchors = Math.max(3, Math.trunc(options.maximumAnchors ?? 128));
  if (anchors.length < 3 || anchors.length > maximumAnchors || rawCandidates.length < 3) return undefined;
  const tolerancePx = Math.max(3, options.tolerancePx ?? 10);
  const voteCellPx = Math.max(3, options.voteCellPx ?? 7);
  const minimumInliers = Math.max(3, Math.min(anchors.length, options.minimumInliers ?? Math.min(6, Math.ceil(anchors.length * 0.3))));
  const maximumCandidates = Math.max(minimumInliers, Math.min(220, options.maximumCandidates ?? 96));
  const maximumOffsetShiftPx = Math.max(20, options.maximumOffsetShiftPx ?? 180);
  const minimumScale = Math.max(0.0001, options.minimumScale ?? 0.002);
  const maximumScale = Math.max(minimumScale * 1.01, options.maximumScale ?? 2);
  const unverifiedSeed = previous.inliers <= 0 || previous.matches.length <= 0;
  const configuredMinimumScaleRatio = Math.max(0.05, options.minimumScaleRatio ?? 0.72);
  const configuredMaximumScaleRatio = Math.max(configuredMinimumScaleRatio * 1.01, options.maximumScaleRatio ?? 1.38);
  const minimumScaleRatio = unverifiedSeed ? Math.min(configuredMinimumScaleRatio, 0.22) : configuredMinimumScaleRatio;
  const maximumScaleRatio = unverifiedSeed ? Math.max(configuredMaximumScaleRatio, 4.5) : configuredMaximumScaleRatio;
  const minimumConfidence = clamp(options.minimumConfidence ?? 0.62, 0, 1);
  const maximumRmsRatio = Math.max(0.1, options.maximumRmsRatio ?? 0.82);
  const confidenceAnchorCap = Math.max(minimumInliers, Math.trunc(options.confidenceAnchorCap ?? 14));
  const configuredFactors = options.scaleFactors ?? [0.82, 0.9, 0.96, 1, 1.04, 1.1, 1.22];
  const factors = [...new Set([
    ...configuredFactors,
    ...(unverifiedSeed ? [0.24, 0.32, 0.42, 0.54, 0.68, 0.84, 1, 1.2, 1.48, 1.82, 2.25, 2.8, 3.5, 4.4] : []),
  ])].filter((factor) => Number.isFinite(factor) && factor > 0.05 && factor < 8);
  const hypothesesPerScale = Math.max(1, Math.min(12, options.hypothesesPerScale ?? 4));
  const candidates = [...rawCandidates]
    .filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, maximumCandidates);

  let best: PassiveTreeRegistration | undefined;
  for (const factor of factors) {
    const scale = previous.transform.scale * factor;
    if (scale < minimumScale || scale > maximumScale) continue;
    const hypotheses = offsetHypotheses(
      anchors,
      candidates,
      previous.transform,
      scale,
      voteCellPx,
      maximumOffsetShiftPx,
      hypothesesPerScale,
    );
    for (const hypothesis of hypotheses) {
      const proposal: PassiveTreeTransform = {
        scale,
        offsetX: hypothesis.offsetX,
        offsetY: hypothesis.offsetY,
        ySign: previous.transform.ySign,
      };
      const proposalMatches = nearestUniqueMatches(proposal, anchors, candidates, tolerancePx * 1.5);
      if (proposalMatches.length < minimumInliers) continue;
      const refined = solvePassiveTreeTransform(proposalMatches, previous.transform.ySign);
      if (!refined || refined.scale < minimumScale || refined.scale > maximumScale) continue;
      const scaleRatio = refined.scale / previous.transform.scale;
      if (scaleRatio < minimumScaleRatio || scaleRatio > maximumScaleRatio) continue;
      if (Math.abs(refined.offsetX - previous.transform.offsetX) > maximumOffsetShiftPx
        || Math.abs(refined.offsetY - previous.transform.offsetY) > maximumOffsetShiftPx) continue;
      const matches = nearestUniqueMatches(refined, anchors, candidates, tolerancePx);
      if (matches.length < minimumInliers) continue;
      const rms = Math.sqrt(matches.reduce((sum, match) => sum + match.distance * match.distance, 0) / matches.length);
      const confidence = registrationConfidence(matches, anchors.length, tolerancePx, confidenceAnchorCap);
      const result: PassiveTreeRegistration = {
        transform: refined,
        matches,
        inliers: matches.length,
        rms,
        confidence,
      };
      if (!best
        || result.inliers > best.inliers
        || (result.inliers === best.inliers && result.confidence > best.confidence)
        || (result.inliers === best.inliers && result.confidence === best.confidence && result.rms < best.rms)) {
        best = result;
      }
    }
  }

  if (!best || best.confidence < minimumConfidence || best.rms > tolerancePx * maximumRmsRatio) return undefined;
  return best;
}
