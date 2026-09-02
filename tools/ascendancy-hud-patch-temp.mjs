import { readFile, writeFile } from 'node:fs/promises';

async function update(path, mutate) {
  const before = await readFile(path, 'utf8');
  const after = mutate(before);
  if (after === before) throw new Error(`${path}: patch made no changes`);
  await writeFile(path, after, 'utf8');
}

function once(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function regexOnce(text, pattern, replacement, label) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return text.replace(pattern, replacement);
}

await update('src/core/passive-tree-hud.ts', (source) => {
  source = once(
    source,
    "import { hasPassiveTreeGeometry, indexPassiveNodes, passiveClassStart, type PassiveNodeRecord, type PassiveTreeSnapshot } from './passive-data';",
    "import { hasPassiveTreeGeometry, indexPassiveNodes, passiveAscendancyNameFromScope, passiveAscendancyStart, passiveClassStart, passiveNodeScopeKey, type PassiveNodeRecord, type PassiveTreeScopeKey, type PassiveTreeSnapshot } from './passive-data';",
    'passive hud imports',
  );
  source = once(
    source,
    "  /** Already resolved start node when the caller has one. */\n  classStartNodeId?: number;\n}",
    "  /** Already resolved start node when the caller has one. */\n  classStartNodeId?: number;\n  /** Restrict registration to the base tree or one named Ascendancy sub-tree. */\n  scopeKey?: PassiveTreeScopeKey;\n}",
    'anchor options scope',
  );
  source = once(
    source,
    "export function passiveNodePoint(node?: PassiveNodeRecord): TreePoint | undefined {\n  if (!node || node.dynamic || node.kind === 'ascendancy' || node.x === undefined || node.y === undefined) return undefined;\n  return { id: node.id, x: node.x, y: node.y };\n}\n",
    `export function passiveNodePoint(node?: PassiveNodeRecord): TreePoint | undefined {\n  if (!node || node.dynamic || node.kind === 'ascendancy' || node.x === undefined || node.y === undefined) return undefined;\n  return { id: node.id, x: node.x, y: node.y };\n}\n\n/** Any fixed GGG tree node, including Ascendancy nodes in their local scope. */\nexport function passiveFixedNodePoint(node?: PassiveNodeRecord): TreePoint | undefined {\n  if (!node || node.dynamic || node.x === undefined || node.y === undefined || !passiveNodeScopeKey(node)) return undefined;\n  return { id: node.id, x: node.x, y: node.y };\n}\n\nexport function passiveHudScopeForNode(snapshot: PassiveTreeSnapshot | undefined, nodeId: number | undefined): PassiveTreeScopeKey | undefined {\n  if (!snapshot || !nodeId || !hasPassiveTreeGeometry(snapshot)) return undefined;\n  return passiveNodeScopeKey(indexPassiveNodes(snapshot).get(nodeId));\n}\n\nexport function passiveHudScopesForTargets(snapshot: PassiveTreeSnapshot | undefined, nodeIds: number[]): PassiveTreeScopeKey[] {\n  if (!snapshot || !hasPassiveTreeGeometry(snapshot)) return [];\n  const nodes = indexPassiveNodes(snapshot);\n  const result: PassiveTreeScopeKey[] = [];\n  const seen = new Set<PassiveTreeScopeKey>();\n  for (const nodeId of nodeIds) {\n    const scope = passiveNodeScopeKey(nodes.get(nodeId));\n    if (scope && !seen.has(scope)) { seen.add(scope); result.push(scope); }\n  }\n  return result;\n}\n`,
    'fixed passive point helpers',
  );

  const replacement = `export function selectPassiveHudAnchors(\n  snapshot: PassiveTreeSnapshot,\n  operations: PassiveOperationLike[],\n  cursor: number,\n  options: PassiveHudAnchorOptions = {},\n): TreePoint[] {\n  if (!hasPassiveTreeGeometry(snapshot)) return [];\n  const recentOperations = options.recentOperations ?? 7;\n  const upcomingOperations = options.upcomingOperations ?? 7;\n  const neighbourDepth = options.neighbourDepth ?? 2;\n  const maxAnchors = options.maxAnchors ?? 20;\n  const nodes = indexPassiveNodes(snapshot);\n  const graph = graphNeighbours(nodes);\n  const targetNodeIds = [...new Set((options.targetNodeIds?.length\n    ? options.targetNodeIds\n    : operations[Math.min(cursor, Math.max(0, operations.length - 1))]?.nodeId\n      ? [operations[Math.min(cursor, operations.length - 1)].nodeId]\n      : []).filter((id) => Number.isSafeInteger(id) && id > 0))];\n  const scopeKey = options.scopeKey ?? (targetNodeIds[0] ? passiveNodeScopeKey(nodes.get(targetNodeIds[0])) : undefined) ?? 'base';\n  const ids: number[] = [];\n  const seen = new Set<number>();\n  const pointInScope = (id: number): TreePoint | undefined => {\n    const node = nodes.get(id);\n    if (passiveNodeScopeKey(node) !== scopeKey) return undefined;\n    return passiveFixedNodePoint(node);\n  };\n  const push = (id: number) => {\n    if (seen.has(id) || !pointInScope(id)) return;\n    seen.add(id);\n    ids.push(id);\n  };\n\n  if (operations.length) {\n    const start = Math.max(0, cursor - recentOperations);\n    const end = Math.min(operations.length, cursor + upcomingOperations + 1);\n    for (let index = start; index < end; index += 1) push(operations[index].nodeId);\n  }\n  for (const id of targetNodeIds) push(id);\n\n  for (const targetId of targetNodeIds.slice(0, 12)) {\n    let frontier = [targetId];\n    const visited = new Set(frontier);\n    for (let depth = 0; depth < neighbourDepth; depth += 1) {\n      const next: number[] = [];\n      for (const id of frontier) {\n        for (const neighbour of graph.get(id) ?? []) {\n          if (visited.has(neighbour)) continue;\n          visited.add(neighbour);\n          if (passiveNodeScopeKey(nodes.get(neighbour)) === scopeKey) { push(neighbour); next.push(neighbour); }\n        }\n      }\n      frontier = next;\n    }\n  }\n\n  if (scopeKey === 'base') {\n    const explicitStart = options.classStartNodeId ? nodes.get(options.classStartNodeId) : undefined;\n    const resolvedStart = explicitStart ?? passiveClassStart(snapshot, { className: options.className, classId: options.classId });\n    if (resolvedStart) push(resolvedStart.id);\n    else if (targetNodeIds[0]) {\n      const target = pointInScope(targetNodeIds[0]);\n      if (target) {\n        const starts = [...nodes.values()]\n          .filter((node) => node.kind === 'class-start')\n          .map((node) => passiveNodePoint(node))\n          .filter((point): point is TreePoint => Boolean(point));\n        starts.sort((left, right) => squaredDistance(left, target) - squaredDistance(right, target));\n        if (starts[0]) push(starts[0].id);\n      }\n    }\n  } else {\n    const ascendancyName = passiveAscendancyNameFromScope(scopeKey);\n    const root = ascendancyName ? passiveAscendancyStart(snapshot, ascendancyName) : undefined;\n    if (root) push(root.id);\n  }\n\n  const primaryTarget = targetNodeIds[0] ? pointInScope(targetNodeIds[0]) : undefined;\n  const points = ids.map((id) => pointInScope(id)).filter((point): point is TreePoint => Boolean(point));\n  if (!primaryTarget || points.length <= maxAnchors) return points.slice(0, maxAnchors);\n\n  const selected: TreePoint[] = [primaryTarget];\n  const remaining = points.filter((point) => point.id !== primaryTarget.id);\n  while (remaining.length && selected.length < maxAnchors) {\n    let bestIndex = 0;\n    let bestDistance = -1;\n    for (let index = 0; index < remaining.length; index += 1) {\n      const nearest = Math.min(...selected.map((chosen) => squaredDistance(chosen, remaining[index])));\n      if (nearest > bestDistance) { bestDistance = nearest; bestIndex = index; }\n    }\n    selected.push(remaining.splice(bestIndex, 1)[0]);\n  }\n  return selected;\n}\n\nexport function passiveHudTarget(snapshot: PassiveTreeSnapshot | undefined, nodeId: number | undefined): TreePoint | undefined {\n  if (!snapshot || !nodeId || !hasPassiveTreeGeometry(snapshot)) return undefined;\n  return passiveFixedNodePoint(indexPassiveNodes(snapshot).get(nodeId));\n}`;
  source = regexOnce(
    source,
    /export function selectPassiveHudAnchors\([\s\S]*?export function passiveHudTarget\(snapshot: PassiveTreeSnapshot \| undefined, nodeId: number \| undefined\): TreePoint \| undefined \{[\s\S]*?\n\}/,
    replacement,
    'scope-aware anchor block',
  );
  return source;
});

await update('electron/services/passive-tree-hud.ts', (source) => {
  source = once(
    source,
    "  passiveHudTarget,\n  projectPassiveTreePoint,\n  registerPassiveTreePointCloud,\n  selectPassiveHudAnchors,\n  type ScreenPoint,\n} from '../../src/core/passive-tree-hud';\nimport { hasPassiveTreeGeometry, indexPassiveNodes, type PassiveTreeSnapshot } from '../../src/core/passive-data';",
    "  passiveHudScopesForTargets,\n  passiveHudTarget,\n  projectPassiveTreePoint,\n  registerPassiveTreePointCloud,\n  selectPassiveHudAnchors,\n  type PassiveTreeRegistration,\n  type ScreenPoint,\n} from '../../src/core/passive-tree-hud';\nimport { hasPassiveTreeGeometry, indexPassiveNodes, passiveNodeScopeKey, type PassiveTreeScopeKey, type PassiveTreeSnapshot } from '../../src/core/passive-data';",
    'service imports',
  );
  source = once(
    source,
    "    state.className ?? '',\n    state.displayId ?? '',",
    "    state.className ?? '',\n    state.treeScope ?? '',\n    state.ascendancyName ?? '',\n    state.displayId ?? '',",
    'state fingerprint scope',
  );
  source = once(
    source,
    "        message: 'The active passive target has no fixed base-tree geometry. Text guidance remains available.',",
    "        message: 'The active passive target has no fixed passive-tree geometry. Text guidance remains available.',",
    'unsupported geometry wording',
  );

  const tryDisplay = `  private async tryDisplay(context: PassiveTreeHudContext, display: Display): Promise<PassiveTreeHudState | undefined> {\n    const snapshot = context.snapshot!;\n    const guide = context.guide!;\n    const { bitmap, capture } = await this.captureDisplay(display);\n    const candidates = detectPassiveTreeNodeCandidates(bitmap, capture.width, capture.height, {\n      radii: [3, 4, 5, 6, 8, 10, 12, 15, 18], stride: 4, angularSamples: 12,\n      minimumContrast: 14, minimumCoverage: 0.54, maximumCandidates: 150,\n    });\n    const nodes = indexPassiveNodes(snapshot);\n    const targetNodeIds = guideTargetIds(guide);\n    const scopes = passiveHudScopesForTargets(snapshot, targetNodeIds);\n    if (!scopes.length || candidates.length < 4) return undefined;\n\n    let best: { scopeKey: PassiveTreeScopeKey; registration: PassiveTreeRegistration; anchors: number } | undefined;\n    for (const scopeKey of scopes) {\n      const scopedTargets = targetNodeIds.filter((nodeId) => passiveNodeScopeKey(nodes.get(nodeId)) === scopeKey);\n      const anchors = selectPassiveHudAnchors(snapshot, guide.operations, guide.cursor, {\n        recentOperations: 8,\n        upcomingOperations: 8,\n        neighbourDepth: 2,\n        maxAnchors: 22,\n        targetNodeIds: scopedTargets,\n        className: guide.className,\n        classStartNodeId: guide.classStartNodeId,\n        scopeKey,\n      });\n      if (anchors.length < 4) continue;\n      const registration = registerPassiveTreePointCloud(anchors, candidates, {\n        minScale: 0.006, maxScale: scopeKey === 'base' ? 0.35 : 0.6, tolerancePx: scopeKey === 'base' ? 10 : 11,\n        minInliers: Math.min(6, Math.max(4, Math.ceil(anchors.length * 0.3))),\n        maxTreePairs: 56, maxScreenCandidates: 120, allowYFlip: false,\n      });\n      if (!registration || registration.confidence < 0.68 || registration.rms > 7.5) continue;\n      if (!best\n        || registration.confidence > best.registration.confidence + 0.02\n        || (Math.abs(registration.confidence - best.registration.confidence) <= 0.02 && registration.inliers > best.registration.inliers)\n        || (registration.inliers === best.registration.inliers && registration.rms < best.registration.rms)) {\n        best = { scopeKey, registration, anchors: anchors.length };\n      }\n    }\n    if (!best) return undefined;\n\n    const { scopeKey, registration } = best;\n    const scopeNode = targetNodeIds.map((nodeId) => nodes.get(nodeId)).find((node) => passiveNodeScopeKey(node) === scopeKey);\n    const ascendancyName = scopeKey === 'base' ? undefined : scopeNode?.ascendancyName;\n    const candidateRadius = median(registration.matches.map((match) => match.screen.radius).filter((radius): radius is number => Number.isFinite(radius)));\n    const radiusScale = display.bounds.width / capture.width;\n    const markerRadius = Math.max(15, Math.min(64, (candidateRadius ?? 8) * radiusScale * 1.35));\n    const path: PassiveTreeHudPathPoint[] = [];\n\n    if (guide.mode === 'exact' && context.pathPreview) {\n      const from = Math.max(0, guide.cursor - 3);\n      const to = Math.min(guide.operations.length, guide.cursor + 5);\n      const used = new Set<number>();\n      for (let index = from; index < to; index += 1) {\n        const operation = guide.operations[index];\n        if (!operation || used.has(operation.nodeId)) continue;\n        const node = nodes.get(operation.nodeId);\n        if (!node || passiveNodeScopeKey(node) !== scopeKey || node.x === undefined || node.y === undefined) continue;\n        used.add(operation.nodeId);\n        const capturePoint = projectPassiveTreePoint(registration.transform, { x: node.x, y: node.y });\n        const local = mapCaptureToLocalDisplay(capturePoint, capture, display);\n        const offscreen = local.x < -80 || local.y < -80 || local.x > display.bounds.width + 80 || local.y > display.bounds.height + 80;\n        path.push({ nodeId: node.id, name: node.name, x: local.x, y: local.y, offscreen, state: index < guide.cursor ? 'recent' : index === guide.cursor ? 'next' : 'upcoming' });\n      }\n    }\n\n    if (guide.mode === 'stage') {\n      for (const stageTarget of guide.stageTargets) {\n        const node = nodes.get(stageTarget.nodeId);\n        if (!node || passiveNodeScopeKey(node) !== scopeKey || node.x === undefined || node.y === undefined) continue;\n        const capturePoint = projectPassiveTreePoint(registration.transform, { x: node.x, y: node.y });\n        const local = mapCaptureToLocalDisplay(capturePoint, capture, display);\n        const offscreen = local.x < -80 || local.y < -80 || local.x > display.bounds.width + 80 || local.y > display.bounds.height + 80;\n        path.push({ nodeId: node.id, name: node.name, x: local.x, y: local.y, offscreen, state: 'stage' });\n      }\n    }\n\n    let targetState: PassiveTreeHudState['target'];\n    if (guide.target && passiveNodeScopeKey(nodes.get(guide.target.nodeId)) === scopeKey) {\n      const treeTarget = passiveHudTarget(snapshot, guide.target.nodeId);\n      if (treeTarget) {\n        const captureTarget = projectPassiveTreePoint(registration.transform, treeTarget);\n        const localTarget = mapCaptureToLocalDisplay(captureTarget, capture, display);\n        const indicator = edgeIndicatorForTarget(localTarget, display.bounds.width, display.bounds.height, 64);\n        targetState = {\n          nodeId: guide.target.nodeId,\n          name: guide.target.nodeName,\n          kind: guide.target.nodeKind,\n          x: localTarget.x,\n          y: localTarget.y,\n          markerRadius,\n          operation: guide.target.type,\n          index: guide.target.index,\n          total: guide.target.total,\n          checkpoint: guide.target.checkpoint,\n          offscreen: indicator.visible,\n          ...(indicator.visible ? { arrowX: indicator.x, arrowY: indicator.y, arrowAngle: indicator.angle } : {}),\n        };\n      }\n    }\n\n    const scopeLabel = ascendancyName ? \`${'${ascendancyName} Ascendancy'}\` : \`${'${guide.className ?? \'Base\'} passive tree'}\`;\n    return {\n      status: 'locked', enabled: true, visible: Boolean(targetState || path.some((point) => !point.offscreen)),\n      mode: guide.mode, sourceLabel: guide.sourceLabel, className: guide.className, classStartNodeId: guide.classStartNodeId,\n      treeScope: ascendancyName ? 'ascendancy' : 'base', ascendancyName,\n      message: guide.mode === 'exact'\n        ? \`${'${scopeLabel} aligned with ${registration.inliers} anchors.'}\`\n        : \`${'${guide.message} ${scopeLabel} aligned with ${registration.inliers} anchors.'}\`,\n      confidence: registration.confidence, inliers: registration.inliers, rms: registration.rms,\n      displayId: display.id, displayBounds: { ...display.bounds }, captureSize: capture,\n      lastLockedAt: new Date().toISOString(), target: targetState, path,\n    };\n  }\n\n  private async captureAndRegister`;
  source = regexOnce(
    source,
    /  private async tryDisplay\(context: PassiveTreeHudContext, display: Display\): Promise<PassiveTreeHudState \| undefined> \{[\s\S]*?\n  private async captureAndRegister/,
    tryDisplay,
    'scope-aware display registration',
  );
  return source;
});

await update('src/ui/PassiveTreeHudOverlay.tsx', (source) => {
  source = once(
    source,
    "  const target = hud.target;\n  const exact = Boolean(target);",
    "  const target = hud.target;\n  const exact = Boolean(target);\n  const scopeLabel = hud.ascendancyName ? `${hud.ascendancyName} Ascendancy` : `${hud.className ?? 'Passive'} tree`;",
    'overlay scope label',
  );
  source = once(
    source,
    "          <div className=\"passive-target-label\">\n            <span>{target.operation === 'refund' ? 'REFUND PASSIVE' : 'NEXT PASSIVE'}</span>",
    "          <div className=\"passive-target-label\">\n            <em className=\"passive-scope-label\">{scopeLabel}</em>\n            <span>{target.operation === 'refund' ? 'REFUND PASSIVE' : 'NEXT PASSIVE'}</span>",
    'target scope badge',
  );
  source = once(
    source,
    "          <span>POB STAGE PASSIVES</span>\n          <strong>{hud.path.filter((point) => point.state === 'stage').length} highlighted</strong>",
    "          <em className=\"passive-scope-label\">{scopeLabel}</em>\n          <span>POB STAGE PASSIVES</span>\n          <strong>{hud.path.filter((point) => point.state === 'stage').length} highlighted</strong>",
    'stage scope badge',
  );
  return source;
});

await update('src/ui/passive-tree-hud.css', (source) => {
  source += `\n.passive-scope-label { display: block; margin-bottom: 4px; font-size: 8px; font-style: normal; font-weight: 800; letter-spacing: .14em; color: rgba(215, 228, 222, .58); text-transform: uppercase; }\n`;
  return source;
});

console.log('Ascendancy HUD production patches applied.');
