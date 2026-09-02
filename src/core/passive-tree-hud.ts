import { hasPassiveTreeGeometry, indexPassiveNodes, passiveClassStart, type PassiveNodeRecord, type PassiveTreeSnapshot } from './passive-data';

export interface TreePoint {
  id: number;
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  score?: number;
  radius?: number;
}

export interface PassiveTreeTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Normally 1. Kept explicit so a rendering-axis inversion can be diagnosed safely. */
  ySign: 1 | -1;
}

export interface PassiveTreeMatch {
  tree: TreePoint;
  screen: ScreenPoint;
  distance: number;
}

export interface PassiveTreeRegistration {
  transform: PassiveTreeTransform;
  matches: PassiveTreeMatch[];
  inliers: number;
  rms: number;
  confidence: number;
}

export interface PassiveTreeRegistrationOptions {
  minScale?: number;
  maxScale?: number;
  tolerancePx?: number;
  minInliers?: number;
  maxTreePairs?: number;
  maxScreenCandidates?: number;
  allowYFlip?: boolean;
}

export interface PassiveOperationLike {
  nodeId: number;
}

export interface PassiveHudAnchorOptions {
  recentOperations?: number;
  upcomingOperations?: number;
  neighbourDepth?: number;
  maxAnchors?: number;
  /** Explicit fixed nodes to seed registration, used by unordered PoB stages. */
  targetNodeIds?: number[];
  /** Friendly build class, e.g. Witch, Duelist or Scion. */
  className?: string;
  /** PoB/GGG class index fallback when no friendly class name is available. */
  classId?: number;
  /** Already resolved start node when the caller has one. */
  classStartNodeId?: number;
}

export interface EdgeIndicator {
  visible: boolean;
  x: number;
  y: number;
  angle: number;
  targetX: number;
  targetY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function squaredDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

export function passiveNodePoint(node?: PassiveNodeRecord): TreePoint | undefined {
  if (!node || node.dynamic || node.kind === 'ascendancy' || node.x === undefined || node.y === undefined) return undefined;
  return { id: node.id, x: node.x, y: node.y };
}

export function projectPassiveTreePoint(transform: PassiveTreeTransform, point: { x: number; y: number }): ScreenPoint {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale * transform.ySign + transform.offsetY,
  };
}

export function unprojectPassiveTreePoint(transform: PassiveTreeTransform, point: { x: number; y: number }): ScreenPoint {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: ((point.y - transform.offsetY) / transform.scale) * transform.ySign,
  };
}

/** Least-squares scale + translation fit with no rotation. */
export function solvePassiveTreeTransform(matches: Array<{ tree: TreePoint; screen: ScreenPoint }>, ySign: 1 | -1 = 1): PassiveTreeTransform | undefined {
  if (matches.length < 2) return undefined;
  const meanTreeX = matches.reduce((sum, match) => sum + match.tree.x, 0) / matches.length;
  const meanTreeY = matches.reduce((sum, match) => sum + match.tree.y * ySign, 0) / matches.length;
  const meanScreenX = matches.reduce((sum, match) => sum + match.screen.x, 0) / matches.length;
  const meanScreenY = matches.reduce((sum, match) => sum + match.screen.y, 0) / matches.length;
  let numerator = 0;
  let denominator = 0;
  for (const match of matches) {
    const tx = match.tree.x - meanTreeX;
    const ty = match.tree.y * ySign - meanTreeY;
    const sx = match.screen.x - meanScreenX;
    const sy = match.screen.y - meanScreenY;
    numerator += tx * sx + ty * sy;
    denominator += tx * tx + ty * ty;
  }
  if (denominator <= 1e-9) return undefined;
  const scale = numerator / denominator;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  return {
    scale,
    offsetX: meanScreenX - meanTreeX * scale,
    offsetY: meanScreenY - meanTreeY * scale,
    ySign,
  };
}

function nearestScreenCandidate(point: ScreenPoint, candidates: ScreenPoint[], maxDistance: number, used?: Set<number>): { index: number; candidate: ScreenPoint; distance: number } | undefined {
  const maxSquared = maxDistance * maxDistance;
  let bestIndex = -1;
  let bestSquared = maxSquared;
  for (let index = 0; index < candidates.length; index += 1) {
    if (used?.has(index)) continue;
    const candidate = candidates[index];
    const distance = squaredDistance(point, candidate);
    if (distance <= bestSquared) {
      bestIndex = index;
      bestSquared = distance;
    }
  }
  return bestIndex < 0 ? undefined : { index: bestIndex, candidate: candidates[bestIndex], distance: Math.sqrt(bestSquared) };
}

function matchTransform(transform: PassiveTreeTransform, anchors: TreePoint[], candidates: ScreenPoint[], tolerancePx: number): PassiveTreeMatch[] {
  const matches: PassiveTreeMatch[] = [];
  const used = new Set<number>();
  const orderedCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => (right.candidate.score ?? 0) - (left.candidate.score ?? 0));
  const remapped = orderedCandidates.map((entry) => entry.candidate);
  for (const tree of anchors) {
    const projected = projectPassiveTreePoint(transform, tree);
    const nearest = nearestScreenCandidate(projected, remapped, tolerancePx, used);
    if (!nearest) continue;
    used.add(nearest.index);
    matches.push({ tree, screen: nearest.candidate, distance: nearest.distance });
  }
  return matches;
}

function registrationConfidence(inliers: number, totalAnchors: number, rms: number, tolerance: number, matches: PassiveTreeMatch[]): number {
  if (!totalAnchors || !matches.length) return 0;
  const ratio = inliers / totalAnchors;
  const residual = 1 - clamp(rms / Math.max(1, tolerance), 0, 1);
  const xs = matches.map((match) => match.tree.x);
  const ys = matches.map((match) => match.tree.y);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  const spread = clamp(Math.hypot(spreadX, spreadY) / 1800, 0.25, 1);
  return clamp(ratio * 0.55 + residual * 0.3 + spread * 0.15, 0, 1);
}

function treePairs(anchors: TreePoint[], maxPairs: number): Array<[TreePoint, TreePoint]> {
  const pairs: Array<[TreePoint, TreePoint, number]> = [];
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      const distance = Math.sqrt(squaredDistance(anchors[left], anchors[right]));
      if (distance >= 70) pairs.push([anchors[left], anchors[right], distance]);
    }
  }
  pairs.sort((left, right) => right[2] - left[2]);
  return pairs.slice(0, maxPairs).map(([left, right]) => [left, right]);
}

export function registerPassiveTreePointCloud(
  anchors: TreePoint[],
  rawCandidates: ScreenPoint[],
  options: PassiveTreeRegistrationOptions = {},
): PassiveTreeRegistration | undefined {
  const minScale = options.minScale ?? 0.008;
  const maxScale = options.maxScale ?? 0.25;
  const tolerancePx = options.tolerancePx ?? 9;
  const minInliers = options.minInliers ?? Math.min(5, Math.max(3, Math.ceil(anchors.length * 0.35)));
  const maxTreePairs = options.maxTreePairs ?? 48;
  const maxScreenCandidates = options.maxScreenCandidates ?? 120;
  if (anchors.length < 3 || rawCandidates.length < minInliers) return undefined;

  const candidates = [...rawCandidates]
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, maxScreenCandidates);
  const pairs = treePairs(anchors, maxTreePairs);
  if (!pairs.length) return undefined;
  const ySigns: Array<1 | -1> = options.allowYFlip ? [1, -1] : [1];
  let best: PassiveTreeRegistration | undefined;

  for (const ySign of ySigns) {
    for (const [treeA, treeB] of pairs) {
      const treeDx = treeB.x - treeA.x;
      const treeDy = (treeB.y - treeA.y) * ySign;
      const treeDistance = Math.hypot(treeDx, treeDy);
      for (let screenAIndex = 0; screenAIndex < candidates.length; screenAIndex += 1) {
        const screenA = candidates[screenAIndex];
        for (let screenBIndex = screenAIndex + 1; screenBIndex < candidates.length; screenBIndex += 1) {
          const screenB = candidates[screenBIndex];
          for (const [first, second] of [[screenA, screenB], [screenB, screenA]] as const) {
            const screenDx = second.x - first.x;
            const screenDy = second.y - first.y;
            const screenDistance = Math.hypot(screenDx, screenDy);
            if (screenDistance < 12) continue;
            const scale = screenDistance / treeDistance;
            if (scale < minScale || scale > maxScale) continue;
            const directionDot = (treeDx * screenDx + treeDy * screenDy) / (treeDistance * screenDistance);
            if (directionDot < 0.992) continue;
            const proposal: PassiveTreeTransform = {
              scale,
              offsetX: first.x - treeA.x * scale,
              offsetY: first.y - treeA.y * scale * ySign,
              ySign,
            };
            const proposalMatches = matchTransform(proposal, anchors, candidates, tolerancePx);
            if (proposalMatches.length < minInliers) continue;
            const refined = solvePassiveTreeTransform(proposalMatches, ySign);
            if (!refined || refined.scale < minScale || refined.scale > maxScale) continue;
            const refinedMatches = matchTransform(refined, anchors, candidates, tolerancePx);
            if (refinedMatches.length < minInliers) continue;
            const rms = Math.sqrt(refinedMatches.reduce((sum, match) => sum + match.distance * match.distance, 0) / refinedMatches.length);
            const confidence = registrationConfidence(refinedMatches.length, anchors.length, rms, tolerancePx, refinedMatches);
            const result: PassiveTreeRegistration = { transform: refined, matches: refinedMatches, inliers: refinedMatches.length, rms, confidence };
            if (!best || result.inliers > best.inliers || (result.inliers === best.inliers && (result.confidence > best.confidence || (result.confidence === best.confidence && result.rms < best.rms)))) best = result;
          }
        }
      }
    }
  }
  return best;
}

function graphNeighbours(nodes: Map<number, PassiveNodeRecord>): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();
  const add = (from: number, to: number) => {
    const set = graph.get(from) ?? new Set<number>();
    set.add(to);
    graph.set(from, set);
  };
  for (const node of nodes.values()) {
    for (const target of node.out ?? []) {
      if (!nodes.has(target)) continue;
      add(node.id, target);
      add(target, node.id);
    }
  }
  return graph;
}

/**
 * Build a local registration constellation around either an ordered guide path
 * or an unordered PoB stage. The class start is resolved from GGG data, never a
 * Ranger-specific node ID, so the same algorithm works for all seven classes.
 */
export function selectPassiveHudAnchors(
  snapshot: PassiveTreeSnapshot,
  operations: PassiveOperationLike[],
  cursor: number,
  options: PassiveHudAnchorOptions = {},
): TreePoint[] {
  if (!hasPassiveTreeGeometry(snapshot)) return [];
  const recentOperations = options.recentOperations ?? 7;
  const upcomingOperations = options.upcomingOperations ?? 7;
  const neighbourDepth = options.neighbourDepth ?? 2;
  const maxAnchors = options.maxAnchors ?? 20;
  const nodes = indexPassiveNodes(snapshot);
  const graph = graphNeighbours(nodes);
  const ids: number[] = [];
  const seen = new Set<number>();
  const push = (id: number) => { if (!seen.has(id) && passiveNodePoint(nodes.get(id))) { seen.add(id); ids.push(id); } };

  if (operations.length) {
    const start = Math.max(0, cursor - recentOperations);
    const end = Math.min(operations.length, cursor + upcomingOperations + 1);
    for (let index = start; index < end; index += 1) push(operations[index].nodeId);
  }

  const targetNodeIds = [...new Set((options.targetNodeIds?.length
    ? options.targetNodeIds
    : operations[Math.min(cursor, Math.max(0, operations.length - 1))]?.nodeId
      ? [operations[Math.min(cursor, operations.length - 1)].nodeId]
      : []).filter((id) => Number.isSafeInteger(id) && id > 0))];
  for (const id of targetNodeIds) push(id);

  for (const targetId of targetNodeIds.slice(0, 12)) {
    let frontier = [targetId];
    const visited = new Set(frontier);
    for (let depth = 0; depth < neighbourDepth; depth += 1) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const neighbour of graph.get(id) ?? []) {
          if (visited.has(neighbour)) continue;
          visited.add(neighbour);
          push(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
    }
  }

  const explicitStart = options.classStartNodeId ? nodes.get(options.classStartNodeId) : undefined;
  const resolvedStart = explicitStart ?? passiveClassStart(snapshot, { className: options.className, classId: options.classId });
  if (resolvedStart) push(resolvedStart.id);
  else if (targetNodeIds[0]) {
    // Last-resort compatibility path for malformed third-party build metadata.
    // It is deliberately generic and only used when the build did not identify
    // a class at all.
    const target = passiveNodePoint(nodes.get(targetNodeIds[0]));
    if (target) {
      const starts = [...nodes.values()].filter((node) => node.kind === 'class-start').map(passiveNodePoint).filter((point): point is TreePoint => Boolean(point));
      starts.sort((left, right) => squaredDistance(left, target) - squaredDistance(right, target));
      if (starts[0]) push(starts[0].id);
    }
  }

  const primaryTarget = targetNodeIds[0] ? passiveNodePoint(nodes.get(targetNodeIds[0])) : undefined;
  const points = ids.map((id) => passiveNodePoint(nodes.get(id))).filter((point): point is TreePoint => Boolean(point));
  if (!primaryTarget || points.length <= maxAnchors) return points.slice(0, maxAnchors);

  const selected: TreePoint[] = [primaryTarget];
  const remaining = points.filter((point) => point.id !== primaryTarget.id);
  while (remaining.length && selected.length < maxAnchors) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const nearest = Math.min(...selected.map((chosen) => squaredDistance(chosen, remaining[index])));
      if (nearest > bestDistance) { bestDistance = nearest; bestIndex = index; }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

export function passiveHudTarget(snapshot: PassiveTreeSnapshot | undefined, nodeId: number | undefined): TreePoint | undefined {
  if (!snapshot || !nodeId || !hasPassiveTreeGeometry(snapshot)) return undefined;
  return passiveNodePoint(indexPassiveNodes(snapshot).get(nodeId));
}

export function edgeIndicatorForTarget(
  target: ScreenPoint,
  width: number,
  height: number,
  inset = 48,
): EdgeIndicator {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const inside = target.x >= inset && target.x <= safeWidth - inset && target.y >= inset && target.y <= safeHeight - inset;
  if (inside) return { visible: false, x: target.x, y: target.y, angle: 0, targetX: target.x, targetY: target.y };
  const centerX = safeWidth / 2;
  const centerY = safeHeight / 2;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  const maxX = Math.max(1, safeWidth / 2 - inset);
  const maxY = Math.max(1, safeHeight / 2 - inset);
  const factor = 1 / Math.max(Math.abs(dx) / maxX, Math.abs(dy) / maxY, 1e-9);
  return {
    visible: true,
    x: centerX + dx * factor,
    y: centerY + dy * factor,
    angle: Math.atan2(dy, dx),
    targetX: target.x,
    targetY: target.y,
  };
}

export function mapCapturePointToDisplay(
  point: ScreenPoint,
  capture: { width: number; height: number },
  display: { x: number; y: number; width: number; height: number },
): ScreenPoint {
  if (capture.width <= 0 || capture.height <= 0) throw new Error('Capture dimensions must be positive.');
  return {
    x: display.x + point.x * (display.width / capture.width),
    y: display.y + point.y * (display.height / capture.height),
  };
}
