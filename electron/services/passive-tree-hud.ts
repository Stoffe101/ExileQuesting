import { app, globalShortcut, screen, type Display } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  edgeIndicatorForTarget,
  passiveFixedNodePoint,
  passiveHudScopeForNode,
  passiveHudTarget,
  projectPassiveTreePoint,
  type PassiveTreeTransform,
} from '../../src/core/passive-tree-hud';
import {
  hasPassiveTreeGeometry,
  indexPassiveNodes,
  passiveAscendancyNameFromScope,
  passiveAscendancyStart,
  passiveNodeScopeKey,
  type PassiveTreeScopeKey,
  type PassiveTreeSnapshot,
} from '../../src/core/passive-data';
import type { PassiveTreeGuidePlan } from '../../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudPathPoint, type PassiveTreeHudState } from '../../src/core/passive-tree-hud-state';

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
}

interface StoredCalibration {
  scale: number;
  offsetX: number;
  offsetY: number;
  ySign: 1 | -1;
  updatedAt: string;
}

interface CalibrationDocument {
  schemaVersion: 1;
  calibrations: Record<string, StoredCalibration>;
}

interface ProjectionContext {
  display: Display;
  scopeKey: PassiveTreeScopeKey;
  calibrationKey: string;
  transform: PassiveTreeTransform;
  calibrated: boolean;
}

const TOGGLE_HOTKEY = 'CommandOrControl+Shift+P';
const RECENTER_HOTKEY = 'CommandOrControl+Shift+C';
const SCALE_UP_HOTKEY = 'CommandOrControl+Shift+Up';
const SCALE_DOWN_HOTKEY = 'CommandOrControl+Shift+Down';
const RESET_HOTKEY = 'CommandOrControl+Shift+0';
const CALIBRATION_FILE = 'passive-tree-hud-calibration.json';
const HOTKEY_REPAIR_INTERVAL_MS = 2_000;
const MIN_SCALE = 0.004;
const MAX_SCALE = 0.35;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function calibrationKey(display: Display, scopeKey: PassiveTreeScopeKey): string {
  const { width, height } = display.bounds;
  return `${display.id}:${width}x${height}:${display.scaleFactor}:${scopeKey}`;
}

function validCalibration(value: unknown): StoredCalibration | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (!finite(item.scale) || !finite(item.offsetX) || !finite(item.offsetY)) return undefined;
  if (item.scale < MIN_SCALE || item.scale > MAX_SCALE) return undefined;
  const ySign = item.ySign === -1 ? -1 : 1;
  return {
    scale: item.scale,
    offsetX: item.offsetX,
    offsetY: item.offsetY,
    ySign,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  };
}

function projectedOffscreen(point: { x: number; y: number }, display: Display, inset = 20): boolean {
  return point.x < inset || point.y < inset || point.x > display.bounds.width - inset || point.y > display.bounds.height - inset;
}

function targetScope(context: PassiveTreeHudContext): PassiveTreeScopeKey | undefined {
  const guide = context.guide;
  if (!guide || !context.snapshot) return undefined;
  const nodeId = guide.target?.nodeId ?? guide.stageTargets[0]?.nodeId;
  return passiveHudScopeForNode(context.snapshot, nodeId);
}

function scopeAnchor(snapshot: PassiveTreeSnapshot, guide: PassiveTreeGuidePlan, scopeKey: PassiveTreeScopeKey) {
  if (scopeKey === 'base') return passiveHudTarget(snapshot, guide.classStartNodeId);
  const name = passiveAscendancyNameFromScope(scopeKey);
  const start = name ? passiveAscendancyStart(snapshot, name) : undefined;
  return passiveFixedNodePoint(start);
}

function estimatedTransform(snapshot: PassiveTreeSnapshot, scopeKey: PassiveTreeScopeKey, display: Display): PassiveTreeTransform | undefined {
  const nodes = indexPassiveNodes(snapshot);
  const points = [...nodes.values()]
    .filter((node) => passiveNodeScopeKey(node) === scopeKey)
    .map((node) => passiveFixedNodePoint(node))
    .filter((point): point is NonNullable<typeof point> => Boolean(point));
  if (points.length < 2) return undefined;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  // PoE's fully zoomed-out tree leaves UI margins around the graph. Start a
  // little conservative, then let the player lock the exact scale once.
  const scale = clamp(Math.min(display.bounds.width * 0.86 / spanX, display.bounds.height * 0.78 / spanY), MIN_SCALE, MAX_SCALE);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return {
    scale,
    offsetX: display.bounds.width / 2 - centreX * scale,
    offsetY: display.bounds.height / 2 - centreY * scale,
    ySign: 1,
  };
}

export class PassiveTreeHudService {
  private stopped = true;
  private requestedVisible = false;
  private state: PassiveTreeHudState = passiveTreeHudIdle(true);
  private calibrations: Record<string, StoredCalibration> = {};
  private hotkeyRepairTimer?: NodeJS.Timeout;

  constructor(private readonly options: PassiveTreeHudServiceOptions) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loadCalibrations().finally(() => {
      if (this.stopped) return;
      this.ensureHotkeys();
      this.hotkeyRepairTimer = setInterval(() => this.ensureHotkeys(), HOTKEY_REPAIR_INTERVAL_MS);
      this.hotkeyRepairTimer.unref?.();
      this.recompute();
    });
  }

  stop(): void {
    this.stopped = true;
    this.requestedVisible = false;
    if (this.hotkeyRepairTimer) clearInterval(this.hotkeyRepairTimer);
    this.hotkeyRepairTimer = undefined;
    for (const accelerator of [TOGGLE_HOTKEY, RECENTER_HOTKEY, SCALE_UP_HOTKEY, SCALE_DOWN_HOTKEY, RESET_HOTKEY]) {
      if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
    }
  }

  poke(): void {
    if (this.stopped) return;
    this.recompute();
  }

  snapshot(): PassiveTreeHudState { return this.state; }

  private calibrationPath(): string {
    return path.join(app.getPath('userData'), CALIBRATION_FILE);
  }

  private async loadCalibrations(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.calibrationPath(), 'utf8')) as CalibrationDocument;
      if (parsed?.schemaVersion !== 1 || !parsed.calibrations || typeof parsed.calibrations !== 'object') return;
      const next: Record<string, StoredCalibration> = {};
      for (const [key, value] of Object.entries(parsed.calibrations)) {
        const calibration = validCalibration(value);
        if (calibration) next[key] = calibration;
      }
      this.calibrations = next;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.options.log?.warn('Passive Tree HUD calibration could not be loaded; starting uncalibrated.', error);
      }
    }
  }

  private async saveCalibrations(): Promise<void> {
    try {
      const filePath = this.calibrationPath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      const document: CalibrationDocument = { schemaVersion: 1, calibrations: this.calibrations };
      await fs.writeFile(temporary, JSON.stringify(document, null, 2), 'utf8');
      await fs.rename(temporary, filePath);
    } catch (error) {
      this.options.log?.warn('Passive Tree HUD calibration could not be saved.', error);
    }
  }

  private ensureHotkeys(): void {
    if (this.stopped || !app.isReady()) return;
    const bindings: Array<[string, () => void]> = [
      [TOGGLE_HOTKEY, () => this.toggle()],
      [RECENTER_HOTKEY, () => this.recenterAtCursor()],
      [SCALE_UP_HOTKEY, () => this.adjustScale(1.02)],
      [SCALE_DOWN_HOTKEY, () => this.adjustScale(1 / 1.02)],
      [RESET_HOTKEY, () => this.resetCalibration()],
    ];
    for (const [accelerator, callback] of bindings) {
      if (globalShortcut.isRegistered(accelerator)) continue;
      if (!globalShortcut.register(accelerator, callback)) this.options.log?.warn(`Passive Tree HUD hotkey could not be registered: ${accelerator}`);
    }
  }

  private toggle(): void {
    const context = this.options.context();
    if (!context.enabled) {
      this.requestedVisible = false;
      this.recompute();
      return;
    }
    this.requestedVisible = !this.requestedVisible;
    this.recompute();
  }

  private displayForCursor(): Display {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  private projectionContext(context: PassiveTreeHudContext, display = this.displayForCursor()): ProjectionContext | undefined {
    const snapshot = context.snapshot;
    const scopeKey = targetScope(context);
    if (!snapshot || !scopeKey || !hasPassiveTreeGeometry(snapshot)) return undefined;
    const key = calibrationKey(display, scopeKey);
    const saved = this.calibrations[key];
    const estimate = saved ?? estimatedTransform(snapshot, scopeKey, display);
    if (!estimate) return undefined;
    return { display, scopeKey, calibrationKey: key, transform: estimate, calibrated: Boolean(saved) };
  }

  private recenterAtCursor(): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    const snapshot = context.snapshot;
    const guide = context.guide;
    if (!projection || !snapshot || !guide) return;
    const anchor = scopeAnchor(snapshot, guide, projection.scopeKey);
    if (!anchor) {
      this.options.log?.warn('Passive Tree HUD recenter requested, but the current tree scope has no fixed start anchor.');
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const localX = cursor.x - projection.display.bounds.x;
    const localY = cursor.y - projection.display.bounds.y;
    const next: StoredCalibration = {
      scale: projection.transform.scale,
      offsetX: localX - anchor.x * projection.transform.scale,
      offsetY: localY - anchor.y * projection.transform.scale * projection.transform.ySign,
      ySign: projection.transform.ySign,
      updatedAt: new Date().toISOString(),
    };
    this.calibrations[projection.calibrationKey] = next;
    this.requestedVisible = true;
    void this.saveCalibrations();
    this.recompute();
  }

  private adjustScale(factor: number): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    const snapshot = context.snapshot;
    const guide = context.guide;
    if (!projection || !snapshot || !guide) return;
    const anchor = scopeAnchor(snapshot, guide, projection.scopeKey);
    if (!anchor) return;
    const oldTransform = projection.transform;
    const anchorScreen = projectPassiveTreePoint(oldTransform, anchor);
    const scale = clamp(oldTransform.scale * factor, MIN_SCALE, MAX_SCALE);
    const next: StoredCalibration = {
      scale,
      offsetX: anchorScreen.x - anchor.x * scale,
      offsetY: anchorScreen.y - anchor.y * scale * oldTransform.ySign,
      ySign: oldTransform.ySign,
      updatedAt: new Date().toISOString(),
    };
    this.calibrations[projection.calibrationKey] = next;
    this.requestedVisible = true;
    void this.saveCalibrations();
    this.recompute();
  }

  private resetCalibration(): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    if (!projection) return;
    delete this.calibrations[projection.calibrationKey];
    void this.saveCalibrations();
    this.requestedVisible = true;
    this.recompute();
  }

  private hiddenState(context: PassiveTreeHudContext): PassiveTreeHudState {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    const guide = context.guide;
    if (!guide || (!guide.target && !guide.stageTargets.length)) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'waiting-build',
        mode: guide?.mode,
        sourceLabel: guide?.sourceLabel,
        className: guide?.className,
        classStartNodeId: guide?.classStartNodeId,
        message: guide?.message ?? 'Import and activate a build with passive progression.',
      };
    }
    if (!hasPassiveTreeGeometry(context.snapshot)) {
      return { ...passiveTreeHudIdle(true), status: 'missing-geometry', message: 'Passive Tree HUD needs the geometry-enabled PoE passive snapshot.' };
    }
    if (Number.isFinite(context.knownUnspentPassivePoints) && Math.trunc(context.knownUnspentPassivePoints!) <= 0) {
      return {
        ...passiveTreeHudIdle(true), status: 'waiting-point', mode: guide.mode, sourceLabel: guide.sourceLabel,
        className: guide.className, classStartNodeId: guide.classStartNodeId,
        message: 'No unspent passive point is available in the latest trusted passive-point state.',
      };
    }
    return {
      ...passiveTreeHudIdle(true),
      status: 'waiting-tree',
      mode: guide.mode,
      sourceLabel: guide.sourceLabel,
      className: guide.className,
      classStartNodeId: guide.classStartNodeId,
      message: `HUD hidden. Open the passive tree, fully zoom out, then press ${TOGGLE_HOTKEY}.`,
    };
  }

  private exactPath(context: PassiveTreeHudContext, projection: ProjectionContext): PassiveTreeHudPathPoint[] {
    const guide = context.guide;
    const snapshot = context.snapshot;
    if (!guide || !snapshot || !context.pathPreview || guide.mode !== 'exact') return [];
    const nodes = indexPassiveNodes(snapshot);
    const start = Math.max(0, guide.cursor - 4);
    const end = Math.min(guide.operations.length, guide.cursor + 7);
    const result: PassiveTreeHudPathPoint[] = [];
    for (let index = start; index < end; index += 1) {
      const operation = guide.operations[index];
      const node = nodes.get(operation.nodeId);
      if (passiveNodeScopeKey(node) !== projection.scopeKey) continue;
      const point = passiveFixedNodePoint(node);
      if (!point) continue;
      const projected = projectPassiveTreePoint(projection.transform, point);
      result.push({
        nodeId: point.id,
        name: node?.name,
        x: projected.x,
        y: projected.y,
        state: index < guide.cursor ? 'recent' : index === guide.cursor ? 'next' : 'upcoming',
        offscreen: projectedOffscreen(projected, projection.display),
      });
    }
    return result;
  }

  private stagePath(context: PassiveTreeHudContext, projection: ProjectionContext): PassiveTreeHudPathPoint[] {
    const guide = context.guide;
    const snapshot = context.snapshot;
    if (!guide || !snapshot || guide.mode !== 'stage') return [];
    const nodes = indexPassiveNodes(snapshot);
    const result: PassiveTreeHudPathPoint[] = [];
    for (const target of guide.stageTargets.slice(0, 160)) {
      const node = nodes.get(target.nodeId);
      if (passiveNodeScopeKey(node) !== projection.scopeKey) continue;
      const point = passiveFixedNodePoint(node);
      if (!point) continue;
      const projected = projectPassiveTreePoint(projection.transform, point);
      result.push({ nodeId: point.id, name: node?.name, x: projected.x, y: projected.y, state: 'stage', offscreen: projectedOffscreen(projected, projection.display) });
    }
    return result;
  }

  private visibleState(context: PassiveTreeHudContext): PassiveTreeHudState {
    const guide = context.guide!;
    const projection = this.projectionContext(context);
    if (!projection) {
      return {
        ...this.hiddenState(context),
        status: 'unsupported-target',
        message: 'The current passive target cannot be projected from fixed GGG tree geometry.',
      };
    }
    const snapshot = context.snapshot!;
    const pathPoints = guide.mode === 'exact' ? this.exactPath(context, projection) : this.stagePath(context, projection);
    const targetPoint = guide.target ? passiveHudTarget(snapshot, guide.target.nodeId) : undefined;
    const projectedTarget = targetPoint ? projectPassiveTreePoint(projection.transform, targetPoint) : undefined;
    const edge = projectedTarget ? edgeIndicatorForTarget(projectedTarget, projection.display.bounds.width, projection.display.bounds.height) : undefined;
    const target = guide.target && projectedTarget ? {
      nodeId: guide.target.nodeId,
      name: guide.target.nodeName,
      kind: guide.target.nodeKind,
      x: projectedTarget.x,
      y: projectedTarget.y,
      markerRadius: clamp(12 + projection.transform.scale * 24, 12, 20),
      operation: guide.target.type,
      index: guide.target.index,
      total: guide.target.total,
      checkpoint: guide.target.checkpoint,
      offscreen: Boolean(edge?.visible),
      arrowX: edge?.visible ? edge.x : undefined,
      arrowY: edge?.visible ? edge.y : undefined,
      arrowAngle: edge?.visible ? edge.angle : undefined,
    } : undefined;
    const ascendancyName = projection.scopeKey === 'base' ? undefined : passiveAscendancyNameFromScope(projection.scopeKey);
    const calibrationMessage = projection.calibrated
      ? `Calibrated HUD. ${TOGGLE_HOTKEY} hides it. If PoE recentered the tree, hover the ${ascendancyName ?? guide.className ?? 'class'} start and press ${RECENTER_HOTKEY}. ${SCALE_UP_HOTKEY}/${SCALE_DOWN_HOTKEY} adjusts scale.`
      : `CALIBRATION REQUIRED: fully zoom out, hover the ${ascendancyName ?? guide.className ?? 'class'} start circle and press ${RECENTER_HOTKEY}. Then use ${SCALE_UP_HOTKEY}/${SCALE_DOWN_HOTKEY} until the route dots sit on their nodes.`;
    return {
      status: 'locked',
      enabled: true,
      visible: true,
      mode: guide.mode,
      sourceLabel: guide.sourceLabel,
      className: guide.className,
      classStartNodeId: guide.classStartNodeId,
      treeScope: projection.scopeKey === 'base' ? 'base' : 'ascendancy',
      ascendancyName,
      message: calibrationMessage,
      confidence: projection.calibrated ? 1 : 0.25,
      displayId: projection.display.id,
      displayBounds: { ...projection.display.bounds },
      captureSize: { width: projection.display.bounds.width, height: projection.display.bounds.height },
      target,
      path: pathPoints,
      lastLockedAt: new Date().toISOString(),
    };
  }

  private recompute(): void {
    if (this.stopped) return;
    const context = this.options.context();
    if (context.appWindowFocused) this.requestedVisible = false;
    const next = this.requestedVisible ? this.visibleState(context) : this.hiddenState(context);
    this.state = next;
    this.options.onState(next);
  }
}
