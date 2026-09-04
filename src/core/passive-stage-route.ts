import { indexPassiveNodes, passiveNodeScopeKey, type PassiveTreeSnapshot } from './passive-data';

export interface DerivedPassiveStageRoute {
  nodeIds: number[];
  /** Multiple valid frontier choices existed; order is deterministic but source did not specify priority. */
  hadBranchChoice: boolean;
}

function adjacency(snapshot: PassiveTreeSnapshot): Map<number, Set<number>> {
  const nodes = indexPassiveNodes(snapshot);
  const graph = new Map<number, Set<number>>();
  const connect = (a: number, b: number) => {
    const left = nodes.get(a);
    const right = nodes.get(b);
    if (!left || !right || passiveNodeScopeKey(left) !== passiveNodeScopeKey(right)) return;
    const leftSet = graph.get(a) ?? new Set<number>();
    const rightSet = graph.get(b) ?? new Set<number>();
    leftSet.add(b);
    rightSet.add(a);
    graph.set(a, leftSet);
    graph.set(b, rightSet);
  };
  for (const node of nodes.values()) for (const out of node.out ?? []) connect(node.id, out);
  return graph;
}

function distanceSquared(snapshot: PassiveTreeSnapshot, leftId: number | undefined, rightId: number): number {
  if (leftId === undefined) return 0;
  const nodes = indexPassiveNodes(snapshot);
  const left = nodes.get(leftId);
  const right = nodes.get(rightId);
  if (!left || !right || left.x === undefined || left.y === undefined || right.x === undefined || right.y === undefined) return 0;
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

/**
 * Derive a click-valid order only for a pure PoB stage expansion. Removed
 * passives/refunds are intentionally rejected because point-budget and repath
 * intent cannot be inferred safely from an allocation snapshot.
 *
 * Every returned node is adjacent to the already-allocated set at the moment
 * it is returned. When several frontier nodes are legal, the route continues
 * near the previous click and then falls back to node ID for determinism.
 */
export function derivePassiveStageAllocationOrder(
  snapshot: PassiveTreeSnapshot,
  previousNodeIds: readonly number[],
  currentNodeIds: readonly number[],
  classStartNodeId?: number,
): DerivedPassiveStageRoute | undefined {
  const nodes = indexPassiveNodes(snapshot);
  const previous = new Set(previousNodeIds.filter((id) => nodes.has(id)));
  const current = new Set(currentNodeIds.filter((id) => nodes.has(id)));
  if (classStartNodeId && current.has(classStartNodeId)) previous.add(classStartNodeId);

  // Any removal means this is a repath/refund stage. Do not pretend an
  // allocation-only order is authoritative.
  for (const id of previousNodeIds) if (nodes.has(id) && !current.has(id) && id !== classStartNodeId) return undefined;

  const remaining = new Set([...current].filter((id) => !previous.has(id) && id !== classStartNodeId));
  if (!remaining.size) return { nodeIds: [], hadBranchChoice: false };
  const graph = adjacency(snapshot);
  const allocated = new Set(previous);

  // First Ascendancy stage can have no previously allocated nodes in that
  // scope. Its fixed root is a safe connectivity seed but is not itself a click.
  for (const id of remaining) {
    const node = nodes.get(id);
    if (node?.ascendancyStart) allocated.add(id);
  }
  for (const id of [...remaining]) if (allocated.has(id)) remaining.delete(id);

  const order: number[] = [];
  let previousClick: number | undefined;
  let hadBranchChoice = false;
  while (remaining.size) {
    const frontier = [...remaining].filter((id) => [...(graph.get(id) ?? [])].some((neighbour) => allocated.has(neighbour)));
    if (!frontier.length) return undefined;
    if (frontier.length > 1) hadBranchChoice = true;
    frontier.sort((left, right) => distanceSquared(snapshot, previousClick, left) - distanceSquared(snapshot, previousClick, right) || left - right);
    const chosen = frontier[0];
    order.push(chosen);
    allocated.add(chosen);
    remaining.delete(chosen);
    previousClick = chosen;
  }
  return { nodeIds: order, hadBranchChoice };
}
