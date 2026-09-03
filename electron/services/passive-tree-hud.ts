import { desktopCapturer, screen, type Display } from 'electron';
import {
  edgeIndicatorForTarget,
  passiveHudScopesForTargets,
  passiveHudTarget,
  projectPassiveTreePoint,
  registerPassiveTreePointCloud,
  selectPassiveHudAnchors,
  type PassiveTreeRegistration,
  type ScreenPoint,
  type TreePoint,
} from '../../src/core/passive-tree-hud';
import { passiveTreePresence } from '../../src/core/passive-tree-presence';
import { trackPassiveTreeRegistration } from '../../src/core/passive-tree-tracking';
import { hasPassiveTreeGeometry, indexPassiveNodes, passiveNodeScopeKey, type PassiveTreeScopeKey, type PassiveTreeSnapshot } from '../../src/core/passive-data';
import type { PassiveTreeGuidePlan } from '../../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudPathPoint, type PassiveTreeHudState } from '../../src/core/passive-tree-hud-state';
import { detectPassiveTreeNodeCandidates } from '../../src/core/passive-tree-vision';

export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  /** Manager/UI focus suppresses the game HUD completely. */
  appWindowFocused?: boolean;
  /** Current character level from Client.txt when available. */
  characterLevel?: number;
  /** Expected route-earned passive reward count. Only used for conservative early-level gating. */
  expectedQuestPassivePoints?: number;
  /** Exact known unspent count when a trusted source such as a current /passives report is available. */
  knownUnspentPassivePoints?: number;
  snapshot?: PassiveTreeSnapshot;
  guide?: PassiveTreeGuidePlan;
}

export interface PassiveTreeHudLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface PassiveTreeHudServiceOptions {
  context: () => PassiveTreeHudContext;
  onState: (state: PassiveTreeHudState) => void;
  log?: PassiveTreeHudLogger;
  captureWidth?: number;
  gateCaptureWidth?: number;
  searchIntervalMs?: number;
  lockedIntervalMs?: number;
}

interface PoeWindowCapture {
  bitmap: Buffer;
  capture: { width: number; height: number };
}

interface PassiveTreeLock {
  displayId: number;
  scopeKey: PassiveTreeScopeKey;
  registration: PassiveTreeRegistration;
}

interface RegisteredScope {
  scopeKey: PassiveTreeScopeKey;
  registration: PassiveTreeRegistration;
  anchors: TreePoint[];
  tracked: boolean;
}

// The idle gate is deliberately tiny and cheap. Accurate registration only runs
// after the passive tree has been detected. While locked, ~2.5 Hz is enough to
// settle on pan/zoom changes without turning the HUD into a video renderer.
const DEFAULT_CAPTURE_WIDTH = 720;
const DEFAULT_GATE_CAPTURE_WIDTH = 360;
const DEFAULT_SEARCH_INTERVAL = 800;
const DEFAULT_LOCKED_INTERVAL = 400;

function isPathOfExileWindowName(name: string): boolean {
  const value = name.trim();
  return /^Path of Exile(?:\s|$)/i.test(value) && !/^Path of Exile 2(?:\s|$)/i.test(value);
}

function captureThumbnailSize(maxWidth: number): { width: number; height: number } {
  const width = Math.max(240, Math.min(1440, Math.round(maxWidth)));
  return { width, height: Math.max(180, Math.round(width * 9 / 16)) };
}

function mapCaptureToLocalDisplay(point: ScreenPoint, capture: { width: number; height: number }, display: Display): ScreenPoint {
  return {
    x: point.x * (display.bounds.width / capture.width),
    y: point.y * (display.bounds.height / capture.height),
  };
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stateFingerprint(state: PassiveTreeHudState): string {
  const target = state.target;
  return [
    state.status,
    state.visible,
    state.mode ?? '',
    state.className ?? '',
    state.treeScope ?? '',
    state.ascendancyName ?? '',
    state.displayId ?? '',
    target?.nodeId ?? '',
    target ? Math.round(target.x) : '',
    target ? Math.round(target.y) : '',
    target?.offscreen ?? '',
    target?.arrowX === undefined ? '' : Math.round(target.arrowX),
    target?.arrowY === undefined ? '' : Math.round(target.arrowY),
    state.confidence === undefined ? '' : state.confidence.toFixed(2),
    state.path.map((point) => `${point.nodeId}:${Math.round(point.x)}:${Math.round(point.y)}:${point.state}:${point.offscreen ? 1 : 0}`).join('|'),
  ].join(';');
}

function guideTargetIds(guide: PassiveTreeGuidePlan): number[] {
  return guide.mode === 'exact'
    ? guide.target ? [guide.target.nodeId] : []
    : guide.stageTargets.map((target) => target.nodeId);
}

function captureCandidates(capture: PoeWindowCapture, cheap: boolean): ScreenPoint[] {
  return detectPassiveTreeNodeCandidates(capture.bitmap, capture.capture.width, capture.capture.height, cheap ? {
    radii: [2, 3, 4, 5, 6],
    stride: 6,
    angularSamples: 8,
    minimumContrast: 13,
    minimumCoverage: 0.5,
    maximumCandidates: 72,
  } : {
    radii: [3, 4, 5, 6, 8, 10, 12, 15],
    stride: 5,
    angularSamples: 10,
    minimumContrast: 14,
    minimumCoverage: 0.54,
    maximumCandidates: 120,
  });
}

export class PassiveTreeHudService {
  private readonly options: Required<Pick<PassiveTreeHudServiceOptions, 'captureWidth' | 'gateCaptureWidth' | 'searchIntervalMs' | 'lockedIntervalMs'>> & PassiveTreeHudServiceOptions;
  private timer?: NodeJS.Timeout;
  private stopped = true;
  private polling = false;
  private lastFingerprint = '';
  private state: PassiveTreeHudState = passiveTreeHudIdle(true);
  private lock?: PassiveTreeLock;

  constructor(options: PassiveTreeHudServiceOptions) {
    this.options = {
      ...options,
      captureWidth: options.captureWidth ?? DEFAULT_CAPTURE_WIDTH,
      gateCaptureWidth: options.gateCaptureWidth ?? DEFAULT_GATE_CAPTURE_WIDTH,
      searchIntervalMs: options.searchIntervalMs ?? DEFAULT_SEARCH_INTERVAL,
      lockedIntervalMs: options.lockedIntervalMs ?? DEFAULT_LOCKED_INTERVAL,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    this.lock = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  poke(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(0);
  }

  snapshot(): PassiveTreeHudState { return this.state; }

  private emit(next: PassiveTreeHudState): void {
    this.state = next;
    const fingerprint = stateFingerprint(next);
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.options.onState(next);
  }

  private schedule(delay?: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    const interval = delay ?? (this.state.status === 'locked' ? this.options.lockedIntervalMs : this.options.searchIntervalMs);
    this.timer = setTimeout(() => void this.poll(), interval);
    this.timer.unref?.();
  }

  private resetLock(): void { this.lock = undefined; }

  private idleState(context: PassiveTreeHudContext): PassiveTreeHudState | undefined {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    if (context.appWindowFocused) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'waiting-tree',
        message: 'Passive Tree HUD is paused while the ExileQuesting manager is focused. Return to Path of Exile to resume.',
      };
    }
    const guide = context.guide;
    if (!guide || (!guide.target && !guide.stageTargets.length)) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'waiting-build',
        mode: guide?.mode,
        sourceLabel: guide?.sourceLabel,
        className: guide?.className,
        classStartNodeId: guide?.classStartNodeId,
        message: guide?.message ?? 'Import and activate a Maxroll or Path of Building profile with passive progression.',
      };
    }
    if (!hasPassiveTreeGeometry(context.snapshot)) {
      return { ...passiveTreeHudIdle(true), status: 'missing-geometry', message: 'Passive Tree HUD needs the geometry-enabled PoE passive snapshot.' };
    }
    const fixedTargets = guideTargetIds(guide).filter((nodeId) => passiveHudTarget(context.snapshot, nodeId));
    if (!fixedTargets.length) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'unsupported-target',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: 'The active passive target has no fixed passive-tree geometry. Text guidance remains available.',
      };
    }

    if (Number.isFinite(context.knownUnspentPassivePoints) && Math.trunc(context.knownUnspentPassivePoints!) <= 0) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'waiting-point',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: 'No unspent passive skill point is available in the latest verified passive-point state.',
      };
    }

    // Before any quest passive can exist, level and acknowledged exact-guide
    // steps are enough to prove a zero-point state without reading game memory.
    if (guide.mode === 'exact' && guide.target && context.characterLevel !== undefined && (context.expectedQuestPassivePoints ?? 0) === 0) {
      const nodes = indexPassiveNodes(context.snapshot!);
      if (passiveNodeScopeKey(nodes.get(guide.target.nodeId)) === 'base') {
        let spent = 0;
        for (const operation of guide.operations.slice(0, guide.cursor)) {
          if (passiveNodeScopeKey(nodes.get(operation.nodeId)) !== 'base') continue;
          spent += operation.type === 'allocate' ? 1 : -1;
        }
        const earned = Math.max(0, Math.trunc(context.characterLevel) - 1);
        if (earned - spent <= 0) {
          return {
            ...passiveTreeHudIdle(true),
            status: 'waiting-point',
            mode: guide.mode,
            sourceLabel: guide.sourceLabel,
            className: guide.className,
            classStartNodeId: guide.classStartNodeId,
            message: 'No unspent level-earned passive point is expected yet. The HUD will resume after the next point is earned.',
          };
        }
      }
    }
    return undefined;
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      const context = this.options.context();
      const idle = this.idleState(context);
      if (idle) {
        this.resetLock();
        this.emit(idle);
        return;
      }

      if (!this.lock) {
        const running = await this.pathOfExileRunning();
        if (!running) {
          this.emit(this.waitingTreeState(context, 'Path of Exile is not running. Passive Tree HUD capture is suspended.'));
          return;
        }
        const gateCapture = await this.capturePoeWindow(this.options.gateCaptureWidth);
        const gateCandidates = captureCandidates(gateCapture, true);
        const presence = passiveTreePresence(gateCandidates, gateCapture.capture.width, gateCapture.capture.height);
        if (!presence.visible) {
          this.emit(this.waitingTreeState(context, 'Path of Exile is running. Waiting for the passive skill tree to be visible.'));
          return;
        }
      }

      await this.captureAndRegister(context);
    } catch (error) {
      if (String(error).includes('POE_NOT_RUNNING')) {
        this.resetLock();
        this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is not running. Passive Tree HUD capture is suspended.'));
      } else {
        this.options.log?.warn('Passive Tree HUD capture failed.', error);
        this.resetLock();
        this.emit({
          status: 'capture-error', enabled: true, visible: false,
          message: `Passive Tree HUD could not inspect the Path of Exile window safely: ${String(error)}`,
          path: [],
        });
      }
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private waitingTreeState(context: PassiveTreeHudContext, message: string): PassiveTreeHudState {
    return {
      status: 'waiting-tree', enabled: true, visible: false,
      mode: context.guide?.mode,
      sourceLabel: context.guide?.sourceLabel,
      className: context.guide?.className,
      classStartNodeId: context.guide?.classStartNodeId,
      message,
      path: [],
    };
  }

  private async pathOfExileRunning(): Promise<boolean> {
    const windows = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return windows.some((candidate) => isPathOfExileWindowName(candidate.name));
  }

  private async capturePoeWindow(maxWidth: number): Promise<PoeWindowCapture> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: captureThumbnailSize(maxWidth),
      fetchWindowIcons: false,
    });
    const poeSources = sources.filter((candidate) => isPathOfExileWindowName(candidate.name));
    if (!poeSources.length) throw new Error('POE_NOT_RUNNING');
    const source = poeSources
      .filter((candidate) => !candidate.thumbnail.isEmpty())
      .sort((left, right) => {
        const leftSize = left.thumbnail.getSize();
        const rightSize = right.thumbnail.getSize();
        return rightSize.width * rightSize.height - leftSize.width * leftSize.height;
      })[0];
    if (!source) throw new Error('Path of Exile window capture returned an empty thumbnail.');
    const capture = source.thumbnail.getSize();
    if (capture.width < 200 || capture.height < 80) throw new Error(`Path of Exile window capture was unexpectedly small (${capture.width}x${capture.height}).`);
    return { bitmap: source.thumbnail.toBitmap(), capture };
  }

  private displayForCapture(capture: { width: number; height: number }): Display {
    const displays = screen.getAllDisplays();
    const lockedId = this.lock?.displayId;
    const locked = lockedId === undefined ? undefined : displays.find((display) => display.id === lockedId);
    if (locked) return locked;
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const captureRatio = capture.width / Math.max(1, capture.height);
    return [...displays].sort((left, right) => {
      const leftError = Math.abs((left.bounds.width / Math.max(1, left.bounds.height)) - captureRatio) - (left.id === cursorDisplay.id ? 0.05 : 0);
      const rightError = Math.abs((right.bounds.width / Math.max(1, right.bounds.height)) - captureRatio) - (right.id === cursorDisplay.id ? 0.05 : 0);
      return leftError - rightError;
    })[0] ?? cursorDisplay;
  }

  private registerScope(
    context: PassiveTreeHudContext,
    scopeKey: PassiveTreeScopeKey,
    candidates: ScreenPoint[],
    display: Display,
  ): RegisteredScope | undefined {
    const snapshot = context.snapshot!;
    const guide = context.guide!;
    const nodes = indexPassiveNodes(snapshot);
    const targetNodeIds = guideTargetIds(guide);
    const scopedTargets = targetNodeIds.filter((nodeId) => passiveNodeScopeKey(nodes.get(nodeId)) === scopeKey);
    const anchors = selectPassiveHudAnchors(snapshot, guide.operations, guide.cursor, {
      recentOperations: 8,
      upcomingOperations: 8,
      neighbourDepth: 2,
      maxAnchors: 22,
      targetNodeIds: scopedTargets,
      className: guide.className,
      classStartNodeId: guide.classStartNodeId,
      scopeKey,
    });
    if (anchors.length < 4) return undefined;

    const minimumInliers = Math.min(6, Math.max(4, Math.ceil(anchors.length * 0.3)));
    if (this.lock?.displayId === display.id && this.lock.scopeKey === scopeKey) {
      const tracked = trackPassiveTreeRegistration(this.lock.registration, anchors, candidates, {
        tolerancePx: scopeKey === 'base' ? 10 : 11,
        minimumInliers,
        maximumCandidates: 84,
        maximumOffsetShiftPx: 190,
      });
      if (tracked) return { scopeKey, registration: tracked, anchors, tracked: true };
    }

    const registration = registerPassiveTreePointCloud(anchors, candidates, {
      minScale: 0.006,
      maxScale: scopeKey === 'base' ? 0.35 : 0.6,
      tolerancePx: scopeKey === 'base' ? 10 : 11,
      minInliers: minimumInliers,
      maxTreePairs: 56,
      maxScreenCandidates: 120,
      allowYFlip: false,
    });
    if (!registration || registration.confidence < 0.68 || registration.rms > 7.5) return undefined;
    return { scopeKey, registration, anchors, tracked: false };
  }

  private bestRegistration(context: PassiveTreeHudContext, candidates: ScreenPoint[], display: Display): RegisteredScope | undefined {
    const snapshot = context.snapshot!;
    const guide = context.guide!;
    const targetNodeIds = guideTargetIds(guide);
    const scopes = passiveHudScopesForTargets(snapshot, targetNodeIds);
    if (!scopes.length || candidates.length < 4) return undefined;

    const lockedScope = this.lock?.displayId === display.id ? this.lock.scopeKey : undefined;
    const orderedScopes = lockedScope && scopes.includes(lockedScope)
      ? [lockedScope, ...scopes.filter((scope) => scope !== lockedScope)]
      : scopes;
    let best: RegisteredScope | undefined;
    for (const scopeKey of orderedScopes) {
      const result = this.registerScope(context, scopeKey, candidates, display);
      if (!result) continue;
      if (result.tracked && scopeKey === lockedScope) return result;
      if (!best
        || result.registration.confidence > best.registration.confidence + 0.02
        || (Math.abs(result.registration.confidence - best.registration.confidence) <= 0.02 && result.registration.inliers > best.registration.inliers)
        || (result.registration.inliers === best.registration.inliers && result.registration.rms < best.registration.rms)) {
        best = result;
      }
    }
    return best;
  }

  private stateForRegistration(
    context: PassiveTreeHudContext,
    capture: { width: number; height: number },
    display: Display,
    best: RegisteredScope,
  ): PassiveTreeHudState {
    const snapshot = context.snapshot!;
    const guide = context.guide!;
    const nodes = indexPassiveNodes(snapshot);
    const targetNodeIds = guideTargetIds(guide);
    const { scopeKey, registration } = best;
    const scopeNode = targetNodeIds.map((nodeId) => nodes.get(nodeId)).find((node) => passiveNodeScopeKey(node) === scopeKey);
    const ascendancyName = scopeKey === 'base' ? undefined : scopeNode?.ascendancyName;
    const candidateRadius = median(registration.matches.map((match) => match.screen.radius).filter((radius): radius is number => Number.isFinite(radius)));
    const radiusScale = display.bounds.width / capture.width;
    const markerRadius = Math.max(15, Math.min(64, (candidateRadius ?? 8) * radiusScale * 1.35));
    const path: PassiveTreeHudPathPoint[] = [];

    if (guide.mode === 'exact' && context.pathPreview) {
      const from = Math.max(0, guide.cursor - 3);
      const to = Math.min(guide.operations.length, guide.cursor + 5);
      const used = new Set<number>();
      for (let index = from; index < to; index += 1) {
        const operation = guide.operations[index];
        if (!operation || used.has(operation.nodeId)) continue;
        const node = nodes.get(operation.nodeId);
        if (!node || passiveNodeScopeKey(node) !== scopeKey || node.x === undefined || node.y === undefined) continue;
        used.add(operation.nodeId);
        const capturePoint = projectPassiveTreePoint(registration.transform, { x: node.x, y: node.y });
        const local = mapCaptureToLocalDisplay(capturePoint, capture, display);
        const offscreen = local.x < -80 || local.y < -80 || local.x > display.bounds.width + 80 || local.y > display.bounds.height + 80;
        path.push({ nodeId: node.id, name: node.name, x: local.x, y: local.y, offscreen, state: index < guide.cursor ? 'recent' : index === guide.cursor ? 'next' : 'upcoming' });
      }
    }

    if (guide.mode === 'stage') {
      for (const stageTarget of guide.stageTargets) {
        const node = nodes.get(stageTarget.nodeId);
        if (!node || passiveNodeScopeKey(node) !== scopeKey || node.x === undefined || node.y === undefined) continue;
        const capturePoint = projectPassiveTreePoint(registration.transform, { x: node.x, y: node.y });
        const local = mapCaptureToLocalDisplay(capturePoint, capture, display);
        const offscreen = local.x < -80 || local.y < -80 || local.x > display.bounds.width + 80 || local.y > display.bounds.height + 80;
        path.push({ nodeId: node.id, name: node.name, x: local.x, y: local.y, offscreen, state: 'stage' });
      }
    }

    let targetState: PassiveTreeHudState['target'];
    if (guide.target && passiveNodeScopeKey(nodes.get(guide.target.nodeId)) === scopeKey) {
      const treeTarget = passiveHudTarget(snapshot, guide.target.nodeId);
      if (treeTarget) {
        const captureTarget = projectPassiveTreePoint(registration.transform, treeTarget);
        const localTarget = mapCaptureToLocalDisplay(captureTarget, capture, display);
        const indicator = edgeIndicatorForTarget(localTarget, display.bounds.width, display.bounds.height, 64);
        targetState = {
          nodeId: guide.target.nodeId,
          name: guide.target.nodeName,
          kind: guide.target.nodeKind,
          x: localTarget.x,
          y: localTarget.y,
          markerRadius,
          operation: guide.target.type,
          index: guide.target.index,
          total: guide.target.total,
          checkpoint: guide.target.checkpoint,
          offscreen: indicator.visible,
          ...(indicator.visible ? { arrowX: indicator.x, arrowY: indicator.y, arrowAngle: indicator.angle } : {}),
        };
      }
    }

    const scopeLabel = ascendancyName ? `${ascendancyName} Ascendancy` : `${guide.className ?? 'Base'} passive tree`;
    return {
      status: 'locked',
      enabled: true,
      visible: Boolean(targetState || path.some((point) => !point.offscreen)),
      mode: guide.mode,
      sourceLabel: guide.sourceLabel,
      className: guide.className,
      classStartNodeId: guide.classStartNodeId,
      treeScope: ascendancyName ? 'ascendancy' : 'base',
      ascendancyName,
      message: guide.mode === 'exact'
        ? `${scopeLabel} aligned with ${registration.inliers} anchors${best.tracked ? ' (tracked)' : ''}.`
        : `${guide.message} ${scopeLabel} aligned with ${registration.inliers} anchors${best.tracked ? ' (tracked)' : ''}.`,
      confidence: registration.confidence,
      inliers: registration.inliers,
      rms: registration.rms,
      displayId: display.id,
      displayBounds: { ...display.bounds },
      captureSize: capture,
      lastLockedAt: new Date().toISOString(),
      target: targetState,
      path,
    };
  }

  private async captureAndRegister(context: PassiveTreeHudContext): Promise<void> {
    const capture = await this.capturePoeWindow(this.options.captureWidth);
    const candidates = captureCandidates(capture, false);
    const display = this.displayForCapture(capture.capture);
    const best = this.bestRegistration(context, candidates, display);

    if (!best) {
      const presence = passiveTreePresence(candidates, capture.capture.width, capture.capture.height, {
        minimumCandidates: 8,
        minimumOccupiedCells: 4,
        minimumHorizontalSpan: 0.25,
        minimumVerticalSpan: 0.22,
      });
      this.resetLock();
      if (!presence.visible) {
        this.emit(this.waitingTreeState(context, 'Passive skill tree is no longer visible. HUD hidden.'));
      } else {
        this.emit({
          status: 'searching', enabled: true, visible: false,
          mode: context.guide?.mode,
          sourceLabel: context.guide?.sourceLabel,
          className: context.guide?.className,
          classStartNodeId: context.guide?.classStartNodeId,
          message: 'Passive tree is visible, but exact node alignment is not confident yet. Move or zoom the tree slightly and ExileQuesting will reacquire it.',
          path: [],
        });
      }
      return;
    }

    this.lock = { displayId: display.id, scopeKey: best.scopeKey, registration: best.registration };
    this.emit(this.stateForRegistration(context, capture.capture, display, best));
  }
}

export const passiveTreeHudInternals = {
  captureThumbnailSize,
  mapCaptureToLocalDisplay,
  isPathOfExileWindowName,
  captureCandidates,
};
