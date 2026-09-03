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
  maximumOffsetShiftPx?: number;
  scaleFactors?: number[];
  hypothesesPerScale?: number;
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

function registrationConfidence(matches: PassiveTreeMatch[], anchorCount: number, tolerancePx: number): number {
  if (!matches.length || !anchorCount) return 0;
  const rms = Math.sqrt(matches.reduce((sum, match) => sum + match.distance * match.distance, 0) / matches.length);
  const ratio = matches.length / anchorCount;
  const residual = 1 - clamp(rms / Math.max(1, tolerancePx), 0, 1);
  return clamp(ratio * 0.72 + residual * 0.28, 0, 1);
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
 * Track an already-registered passive tree through ordinary pan/zoom changes.
 *
 * This deliberately searches only near the previous transform. A large jump or
 * unrelated screen fails closed so the caller can fall back to the slower full
 * point-cloud registration. No game state or input is read here, only node
 * centres from the current screen capture.
 */
export function trackPassiveTreeRegistration(
  previous: PassiveTreeRegistration,
  anchors: TreePoint[],
  rawCandidates: ScreenPoint[],
  options: PassiveTreeTrackingOptions = {},
): PassiveTreeRegistration | undefined {
  if (anchors.length < 3 || rawCandidates.length < 3) return undefined;
  const tolerancePx = Math.max(3, options.tolerancePx ?? 10);
  const voteCellPx = Math.max(3, options.voteCellPx ?? 7);
  const minimumInliers = Math.max(3, Math.min(anchors.length, options.minimumInliers ?? Math.min(6, Math.ceil(anchors.length * 0.3))));
  const maximumCandidates = Math.max(minimumInliers, Math.min(120, options.maximumCandidates ?? 72));
  const maximumOffsetShiftPx = Math.max(20, options.maximumOffsetShiftPx ?? 180);
  const factors = (options.scaleFactors ?? [0.9, 0.94, 0.97, 1, 1.03, 1.06, 1.1])
    .filter((factor) => Number.isFinite(factor) && factor > 0.75 && factor < 1.3);
  const hypothesesPerScale = Math.max(1, Math.min(8, options.hypothesesPerScale ?? 3));
  const candidates = [...rawCandidates]
    .filter((candidate) => Number.isFinite(candidate.x) && Number.isFinite(candidate.y))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, maximumCandidates);

  let best: PassiveTreeRegistration | undefined;
  for (const factor of factors) {
    const scale = previous.transform.scale * factor;
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
      const proposalMatches = nearestUniqueMatches(proposal, anchors, candidates, tolerancePx * 1.45);
      if (proposalMatches.length < minimumInliers) continue;
      const refined = solvePassiveTreeTransform(proposalMatches, previous.transform.ySign);
      if (!refined) continue;
      const scaleRatio = refined.scale / previous.transform.scale;
      if (scaleRatio < 0.86 || scaleRatio > 1.14) continue;
      if (Math.abs(refined.offsetX - previous.transform.offsetX) > maximumOffsetShiftPx
        || Math.abs(refined.offsetY - previous.transform.offsetY) > maximumOffsetShiftPx) continue;
      const matches = nearestUniqueMatches(refined, anchors, candidates, tolerancePx);
      if (matches.length < minimumInliers) continue;
      const rms = Math.sqrt(matches.reduce((sum, match) => sum + match.distance * match.distance, 0) / matches.length);
      const confidence = registrationConfidence(matches, anchors.length, tolerancePx);
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

  if (!best || best.confidence < 0.62 || best.rms > tolerancePx * 0.82) return undefined;
  return best;
}
