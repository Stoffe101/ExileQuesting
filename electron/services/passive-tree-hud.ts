import { desktopCapturer, screen, type Display } from 'electron';
import {
  edgeIndicatorForTarget,
  passiveHudTarget,
  projectPassiveTreePoint,
  registerPassiveTreePointCloud,
  selectPassiveHudAnchors,
  type PassiveOperationLike,
  type ScreenPoint,
} from '../../src/core/passive-tree-hud';
import { hasPassiveTreeGeometry, indexPassiveNodes, type PassiveTreeSnapshot } from '../../src/core/passive-data';
import { passiveTreeHudIdle, type PassiveTreeHudPathPoint, type PassiveTreeHudState } from '../../src/core/passive-tree-hud-state';
import { detectPassiveTreeNodeCandidates } from '../../src/core/passive-tree-vision';

export interface PassiveTreeHudGuideTarget {
  nodeId: number;
  nodeName: string;
  nodeKind?: 'normal' | 'notable' | 'keystone' | 'mastery' | 'socket' | 'class-start' | 'ascendancy';
  type: 'allocate' | 'refund';
  index: number;
  total: number;
  checkpoint: number;
}

export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  snapshot?: PassiveTreeSnapshot;
  operations: PassiveOperationLike[];
  cursor: number;
  target?: PassiveTreeHudGuideTarget;
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
  searchIntervalMs?: number;
  lockedIntervalMs?: number;
}

const DEFAULT_CAPTURE_WIDTH = 960;
const DEFAULT_SEARCH_INTERVAL = 850;
const DEFAULT_LOCKED_INTERVAL = 300;

function captureThumbnailSize(display: Display, maxWidth: number): { width: number; height: number } {
  const width = Math.max(480, Math.min(1440, Math.round(maxWidth)));
  const ratio = display.bounds.height / Math.max(1, display.bounds.width);
  return { width, height: Math.max(270, Math.round(width * ratio)) };
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
    state.displayId ?? '',
    target?.nodeId ?? '',
    target ? Math.round(target.x) : '',
    target ? Math.round(target.y) : '',
    target?.offscreen ?? '',
    target?.arrowX === undefined ? '' : Math.round(target.arrowX),
    target?.arrowY === undefined ? '' : Math.round(target.arrowY),
    state.confidence === undefined ? '' : state.confidence.toFixed(2),
    state.path.map((point) => `${point.nodeId}:${Math.round(point.x)}:${Math.round(point.y)}:${point.state}`).join('|'),
  ].join(';');
}

export class PassiveTreeHudService {
  private readonly options: Required<Pick<PassiveTreeHudServiceOptions, 'captureWidth' | 'searchIntervalMs' | 'lockedIntervalMs'>> & PassiveTreeHudServiceOptions;
  private timer?: NodeJS.Timeout;
  private stopped = true;
  private polling = false;
  private lastFingerprint = '';
  private state: PassiveTreeHudState = passiveTreeHudIdle(true);

  constructor(options: PassiveTreeHudServiceOptions) {
    this.options = {
      ...options,
      captureWidth: options.captureWidth ?? DEFAULT_CAPTURE_WIDTH,
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
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  poke(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(0);
  }

  snapshot(): PassiveTreeHudState {
    return this.state;
  }

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

  private idleState(context: PassiveTreeHudContext): PassiveTreeHudState | undefined {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    if (!context.target || !context.operations.length) {
      return { ...passiveTreeHudIdle(true), status: 'waiting-build', message: 'Import and activate a Maxroll leveling guide for exact Passive Tree HUD guidance.' };
    }
    if (!hasPassiveTreeGeometry(context.snapshot)) {
      return { ...passiveTreeHudIdle(true), status: 'missing-geometry', message: 'Passive Tree HUD needs the geometry-enabled PoE passive snapshot.' };
    }
    if (!passiveHudTarget(context.snapshot, context.target.nodeId)) {
      return { ...passiveTreeHudIdle(true), status: 'unsupported-target', message: `${context.target.nodeName} has no main-tree geometry. Text guidance remains available.` };
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
        this.emit(idle);
        return;
      }
      await this.captureAndRegister(context);
    } catch (error) {
      this.options.log?.warn('Passive Tree HUD capture failed.', error);
      this.emit({
        status: 'capture-error',
        enabled: true,
        visible: false,
        message: `Passive Tree HUD could not capture the active display: ${String(error)}`,
        path: [],
      });
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private async captureAndRegister(context: PassiveTreeHudContext): Promise<void> {
    const snapshot = context.snapshot!;
    const target = context.target!;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const thumbnailSize = captureThumbnailSize(display, this.options.captureWidth);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize, fetchWindowIcons: false });
    const source = sources.find((candidate) => candidate.display_id && candidate.display_id === String(display.id))
      ?? (screen.getAllDisplays().length === 1 && sources.length === 1 ? sources[0] : undefined);
    if (!source) throw new Error(`No unambiguous desktop capture source matched display ${display.id}.`);
    if (source.thumbnail.isEmpty()) throw new Error('Desktop capture returned an empty thumbnail.');
    const capture = source.thumbnail.getSize();
    if (capture.width < 320 || capture.height < 180) throw new Error(`Desktop capture was unexpectedly small (${capture.width}x${capture.height}).`);
    const bitmap = source.thumbnail.toBitmap();

    const candidates = detectPassiveTreeNodeCandidates(bitmap, capture.width, capture.height, {
      radii: [3, 4, 5, 6, 8, 10, 12, 15, 18],
      stride: 4,
      angularSamples: 12,
      minimumContrast: 14,
      minimumCoverage: 0.54,
      maximumCandidates: 150,
    });
    const anchors = selectPassiveHudAnchors(snapshot, context.operations, context.cursor, {
      recentOperations: 8,
      upcomingOperations: 8,
      neighbourDepth: 2,
      maxAnchors: 20,
    });
    if (anchors.length < 4 || candidates.length < 4) {
      this.emit({
        status: 'searching', enabled: true, visible: false,
        message: 'Open the Path of Exile passive tree. Looking for enough visible passive nodes to register the HUD…',
        displayId: display.id, displayBounds: { ...display.bounds }, captureSize: capture, path: [],
      });
      return;
    }

    const registration = registerPassiveTreePointCloud(anchors, candidates, {
      minScale: 0.006,
      maxScale: 0.35,
      tolerancePx: 10,
      minInliers: Math.min(6, Math.max(4, Math.ceil(anchors.length * 0.3))),
      maxTreePairs: 52,
      maxScreenCandidates: 120,
      // Keep the production default non-mirrored. If a future GGG rendering
      // axis differs, diagnostics/tests can opt in before changing this safely.
      allowYFlip: false,
    });
    if (!registration || registration.confidence < 0.68 || registration.rms > 7.5) {
      this.emit({
        status: 'searching', enabled: true, visible: false,
        message: 'Passive tree detected candidates, but alignment confidence is not high enough to place a safe marker yet.',
        confidence: registration?.confidence,
        inliers: registration?.inliers,
        rms: registration?.rms,
        displayId: display.id,
        displayBounds: { ...display.bounds },
        captureSize: capture,
        path: [],
      });
      return;
    }

    const treeTarget = passiveHudTarget(snapshot, target.nodeId)!;
    const captureTarget = projectPassiveTreePoint(registration.transform, treeTarget);
    const localTarget = mapCaptureToLocalDisplay(captureTarget, capture, display);
    const indicator = edgeIndicatorForTarget(localTarget, display.bounds.width, display.bounds.height, 64);
    const candidateRadius = median(registration.matches.map((match) => match.screen.radius).filter((radius): radius is number => Number.isFinite(radius)));
    const radiusScale = display.bounds.width / capture.width;
    const markerRadius = Math.max(15, Math.min(64, (candidateRadius ?? 8) * radiusScale * 1.35));
    const nodes = indexPassiveNodes(snapshot);
    const path: PassiveTreeHudPathPoint[] = [];
    if (context.pathPreview) {
      const from = Math.max(0, context.cursor - 3);
      const to = Math.min(context.operations.length, context.cursor + 5);
      const used = new Set<number>();
      for (let index = from; index < to; index += 1) {
        const operation = context.operations[index];
        if (!operation || used.has(operation.nodeId)) continue;
        const node = nodes.get(operation.nodeId);
        if (!node || node.x === undefined || node.y === undefined) continue;
        used.add(operation.nodeId);
        const capturePoint = projectPassiveTreePoint(registration.transform, { x: node.x, y: node.y });
        const local = mapCaptureToLocalDisplay(capturePoint, capture, display);
        if (local.x < -80 || local.y < -80 || local.x > display.bounds.width + 80 || local.y > display.bounds.height + 80) continue;
        path.push({
          nodeId: node.id,
          x: local.x,
          y: local.y,
          state: index < context.cursor ? 'recent' : index === context.cursor ? 'next' : 'upcoming',
        });
      }
    }

    const now = new Date().toISOString();
    this.emit({
      status: 'locked',
      enabled: true,
      visible: true,
      message: `Passive tree aligned with ${registration.inliers} anchors.`,
      confidence: registration.confidence,
      inliers: registration.inliers,
      rms: registration.rms,
      displayId: display.id,
      displayBounds: { ...display.bounds },
      captureSize: capture,
      lastLockedAt: now,
      target: {
        nodeId: target.nodeId,
        name: target.nodeName,
        kind: target.nodeKind,
        x: localTarget.x,
        y: localTarget.y,
        markerRadius,
        operation: target.type,
        index: target.index,
        total: target.total,
        checkpoint: target.checkpoint,
        offscreen: indicator.visible,
        ...(indicator.visible ? { arrowX: indicator.x, arrowY: indicator.y, arrowAngle: indicator.angle } : {}),
      },
      path,
    });
  }
}

export const passiveTreeHudInternals = { captureThumbnailSize, mapCaptureToLocalDisplay };
