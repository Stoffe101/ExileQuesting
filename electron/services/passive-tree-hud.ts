import { app, desktopCapturer, globalShortcut, screen, type Display } from 'electron';
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
import {
  createPassiveTreeScreenSignature,
  matchPassiveTreeScreenSignature,
  validatePassiveTreeScreenSignature,
  type PassiveTreeScreenSignature,
} from '../../src/core/passive-tree-screen-check';

export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  /** Manager/UI focus suppresses the game HUD completely. */
  appWindowFocused?: boolean;
  /** Current character level from Client.txt when available. */
  characterLevel?: number;
  /** Expected route-earned passive reward count. Only used for conservative point gating. */
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
  searchIntervalMs?: number;
  lockedIntervalMs?: number;
}

interface PoeWindowCapture {
  bitmap: Buffer;
  capture: { width: number; height: number };
  /** Electron maps this to screen.Display.id when the platform exposes it. */
  displayId?: string;
}

interface StoredCalibration {
  scale: number;
  offsetX: number;
  offsetY: number;
  ySign: 1 | -1;
  captureAspect: number;
  screenCheck: PassiveTreeScreenSignature;
  updatedAt: string;
}

interface CalibrationDocument {
  schemaVersion: 2;
  calibrations: Record<string, StoredCalibration>;
}

interface ProjectionContext {
  display: Display;
  scopeKey: PassiveTreeScopeKey;
  calibrationKey: string;
  transform: PassiveTreeTransform;
  calibration: StoredCalibration;
}

const RECENTER_HOTKEY = 'CommandOrControl+Shift+C';
const SCALE_UP_HOTKEY = 'CommandOrControl+Shift+Up';
const SCALE_DOWN_HOTKEY = 'CommandOrControl+Shift+Down';
const RESET_HOTKEY = 'CommandOrControl+Shift+0';
const CALIBRATION_FILE = 'passive-tree-hud-calibration.json';
const HOTKEY_REPAIR_INTERVAL_MS = 2_000;
const DEFAULT_CAPTURE_WIDTH = 480;
const DEFAULT_SEARCH_INTERVAL = 850;
const DEFAULT_LOCKED_INTERVAL = 450;
const MIN_SCALE = 0.004;
const MAX_SCALE = 0.35;
const REQUIRED_TREE_MATCHES = 2;
const MAX_CAPTURE_ASPECT_DRIFT = 0.06;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function isPathOfExileWindowName(name: string): boolean {
  const value = name.trim();
  return /^Path of Exile(?:\s|$)/i.test(value) && !/^Path of Exile 2(?:\s|$)/i.test(value);
}

function captureThumbnailSize(maxWidth: number): { width: number; height: number } {
  const width = Math.max(320, Math.min(720, Math.round(maxWidth)));
  return { width, height: Math.max(180, Math.round(width * 9 / 16)) };
}

function calibrationKey(display: Display, scopeKey: PassiveTreeScopeKey): string {
  const { width, height } = display.bounds;
  return `${display.id}:${width}x${height}:${display.scaleFactor}:${scopeKey}`;
}

function validCalibration(value: unknown): StoredCalibration | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (!finite(item.scale) || !finite(item.offsetX) || !finite(item.offsetY) || !finite(item.captureAspect)) return undefined;
  if (item.scale < MIN_SCALE || item.scale > MAX_SCALE || item.captureAspect < 0.5 || item.captureAspect > 5) return undefined;
  const screenCheck = validatePassiveTreeScreenSignature(item.screenCheck);
  if (!screenCheck) return undefined;
  return {
    scale: item.scale,
    offsetX: item.offsetX,
    offsetY: item.offsetY,
    ySign: item.ySign === -1 ? -1 : 1,
    captureAspect: item.captureAspect,
    screenCheck,
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
  return passiveFixedNodePoint(name ? passiveAscendancyStart(snapshot, name) : undefined);
}

/**
 * Exile-UI's PoE 1 schematic uses clientHeight / 10000 at full in-game zoom.
 * Electron overlay coordinates are display-independent pixels, so display
 * height is the matching coordinate-space height for a borderless/fullscreen
 * client. Translation is then established from the actual class-start circle.
 */
function fullZoomScale(display: Display): number {
  return clamp(display.bounds.height / 10_000, MIN_SCALE, MAX_SCALE);
}

/**
 * desktopCapturer explicitly does not guarantee that a returned thumbnail has
 * the requested dimensions. Do not compare thumbnail aspect to monitor aspect
 * as a correctness gate. We only require captures for one calibration to keep
 * a stable shape, and use DesktopCapturerSource.display_id when available to
 * ensure the PoE window is still on the calibrated display.
 */
function captureAspect(capture: PoeWindowCapture): number {
  return capture.capture.width / Math.max(1, capture.capture.height);
}

function captureAspectStable(expected: number, capture: PoeWindowCapture): boolean {
  const current = captureAspect(capture);
  return expected > 0 && Math.abs(current / expected - 1) <= MAX_CAPTURE_ASPECT_DRIFT;
}

function captureDisplayMatches(capture: PoeWindowCapture, display: Display): boolean {
  const sourceDisplayId = capture.displayId?.trim();
  return !sourceDisplayId || sourceDisplayId === String(display.id);
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
    state.message,
    target?.nodeId ?? '',
    target ? Math.round(target.x) : '',
    target ? Math.round(target.y) : '',
    target?.offscreen ?? '',
    state.path.map((point) => `${point.nodeId}:${Math.round(point.x)}:${Math.round(point.y)}:${point.state}:${point.offscreen ? 1 : 0}`).join('|'),
  ].join(';');
}

function guideTargetIds(guide: PassiveTreeGuidePlan): number[] {
  return guide.mode === 'exact'
    ? guide.target ? [guide.target.nodeId] : []
    : guide.stageTargets.map((target) => target.nodeId);
}

export class PassiveTreeHudService {
  private readonly options: Required<Pick<PassiveTreeHudServiceOptions, 'captureWidth' | 'searchIntervalMs' | 'lockedIntervalMs'>> & PassiveTreeHudServiceOptions;
  private stopped = true;
  private polling = false;
  private calibrating = false;
  private recenterQueued = false;
  private timer?: NodeJS.Timeout;
  private hotkeyRepairTimer?: NodeJS.Timeout;
  private state: PassiveTreeHudState = passiveTreeHudIdle(true);
  private lastFingerprint = '';
  private calibrations: Record<string, StoredCalibration> = {};
  private consecutiveTreeMatches = 0;

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
    void this.loadCalibrations().finally(() => {
      if (this.stopped) return;
      this.ensureHotkeys();
      this.hotkeyRepairTimer = setInterval(() => this.ensureHotkeys(), HOTKEY_REPAIR_INTERVAL_MS);
      this.hotkeyRepairTimer.unref?.();
      this.schedule(0);
    });
  }

  stop(): void {
    this.stopped = true;
    this.recenterQueued = false;
    this.consecutiveTreeMatches = 0;
    if (this.timer) clearTimeout(this.timer);
    if (this.hotkeyRepairTimer) clearInterval(this.hotkeyRepairTimer);
    this.timer = undefined;
    this.hotkeyRepairTimer = undefined;
    for (const accelerator of [RECENTER_HOTKEY, SCALE_UP_HOTKEY, SCALE_DOWN_HOTKEY, RESET_HOTKEY]) {
      if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
    }
  }

  poke(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(0);
  }

  snapshot(): PassiveTreeHudState { return this.state; }

  private calibrationPath(): string {
    return path.join(app.getPath('userData'), CALIBRATION_FILE);
  }

  private async loadCalibrations(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.calibrationPath(), 'utf8')) as CalibrationDocument;
      if (parsed?.schemaVersion !== 2 || !parsed.calibrations || typeof parsed.calibrations !== 'object') return;
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
      const document: CalibrationDocument = { schemaVersion: 2, calibrations: this.calibrations };
      await fs.writeFile(temporary, JSON.stringify(document, null, 2), 'utf8');
      await fs.rename(temporary, filePath);
    } catch (error) {
      this.options.log?.warn('Passive Tree HUD calibration could not be saved.', error);
    }
  }

  private ensureHotkeys(): void {
    if (this.stopped || !app.isReady()) return;
    const bindings: Array<[string, () => void]> = [
      [RECENTER_HOTKEY, () => this.queueRecenter()],
      [SCALE_UP_HOTKEY, () => this.adjustScale(1.01)],
      [SCALE_DOWN_HOTKEY, () => this.adjustScale(1 / 1.01)],
      [RESET_HOTKEY, () => this.resetCalibration()],
    ];
    for (const [accelerator, callback] of bindings) {
      if (globalShortcut.isRegistered(accelerator)) continue;
      if (!globalShortcut.register(accelerator, callback)) this.options.log?.warn(`Passive Tree HUD hotkey could not be registered: ${accelerator}`);
    }
  }

  private emit(next: PassiveTreeHudState): void {
    this.state = next;
    const fingerprint = stateFingerprint(next);
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.options.onState(next);
  }

  private schedule(delay?: number): void {
    if (this.stopped || this.calibrating) return;
    if (this.timer) clearTimeout(this.timer);
    const interval = delay ?? (this.state.status === 'locked' ? this.options.lockedIntervalMs : this.options.searchIntervalMs);
    this.timer = setTimeout(() => { void this.poll(); }, interval);
    this.timer.unref?.();
  }

  private queueRecenter(): void {
    if (this.stopped) return;
    this.recenterQueued = true;
    if (this.polling || this.calibrating) {
      this.options.log?.info('Passive Tree HUD calibration queued until the current capture operation completes.');
      return;
    }
    void this.runQueuedRecenter();
  }

  private async runQueuedRecenter(): Promise<void> {
    if (this.stopped || this.polling || this.calibrating || !this.recenterQueued) return;
    this.recenterQueued = false;
    this.calibrating = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      await this.recenterAtCursor();
    } finally {
      this.calibrating = false;
      if (this.stopped) return;
      if (this.recenterQueued) void this.runQueuedRecenter();
      else this.schedule(0);
    }
  }

  private projectionContext(context: PassiveTreeHudContext): ProjectionContext | undefined {
    const scopeKey = targetScope(context);
    if (!scopeKey) return undefined;
    const displays = screen.getAllDisplays();
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const ordered = [cursorDisplay, ...displays.filter((display) => display.id !== cursorDisplay.id)];
    for (const display of ordered) {
      const key = calibrationKey(display, scopeKey);
      const calibration = this.calibrations[key];
      if (!calibration) continue;
      return {
        display,
        scopeKey,
        calibrationKey: key,
        transform: {
          scale: calibration.scale,
          offsetX: calibration.offsetX,
          offsetY: calibration.offsetY,
          ySign: calibration.ySign,
        },
        calibration,
      };
    }
    return undefined;
  }

  private eligibilityState(context: PassiveTreeHudContext): PassiveTreeHudState | undefined {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    if (context.appWindowFocused) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'waiting-tree',
        message: 'Passive Tree HUD is paused while the ExileQuesting manager is focused.',
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
        message: guide?.message ?? 'Import and activate a build with passive progression.',
      };
    }
    if (!hasPassiveTreeGeometry(context.snapshot)) {
      return { ...passiveTreeHudIdle(true), status: 'missing-geometry', message: 'Passive Tree HUD needs the geometry-enabled PoE passive snapshot.' };
    }
    const fixedTargets = guideTargetIds(guide).filter((nodeId) => passiveHudTarget(context.snapshot, nodeId));
    if (!fixedTargets.length) {
      return {
        ...passiveTreeHudIdle(true), status: 'unsupported-target', mode: guide.mode, sourceLabel: guide.sourceLabel,
        className: guide.className, classStartNodeId: guide.classStartNodeId,
        message: 'The active passive target has no fixed passive-tree geometry. Text guidance remains available.',
      };
    }
    if (Number.isFinite(context.knownUnspentPassivePoints) && Math.trunc(context.knownUnspentPassivePoints!) <= 0) {
      return {
        ...passiveTreeHudIdle(true), status: 'waiting-point', mode: guide.mode, sourceLabel: guide.sourceLabel,
        className: guide.className, classStartNodeId: guide.classStartNodeId,
        message: 'No unspent passive point is available in the latest trusted passive-point state.',
      };
    }

    // Before route quest points can exist, level and acknowledged exact-guide
    // steps are enough to prove a zero-point state without touching capture.
    if (guide.mode === 'exact' && guide.target && context.characterLevel !== undefined && (context.expectedQuestPassivePoints ?? 0) === 0) {
      const nodes = indexPassiveNodes(context.snapshot);
      if (passiveNodeScopeKey(nodes.get(guide.target.nodeId)) === 'base') {
        let spent = 0;
        for (const operation of guide.operations.slice(0, guide.cursor)) {
          if (passiveNodeScopeKey(nodes.get(operation.nodeId)) !== 'base') continue;
          spent += operation.type === 'allocate' ? 1 : -1;
        }
        const earned = Math.max(0, Math.trunc(context.characterLevel) - 1);
        if (earned - spent <= 0) {
          return {
            ...passiveTreeHudIdle(true), status: 'waiting-point', mode: guide.mode, sourceLabel: guide.sourceLabel,
            className: guide.className, classStartNodeId: guide.classStartNodeId,
            message: 'No unspent level-earned passive point is expected yet. The HUD will resume after the next point is earned.',
          };
        }
      }
    }
    return undefined;
  }

  private waitingTreeState(context: PassiveTreeHudContext, message: string, status: 'waiting-tree' | 'searching' = 'waiting-tree'): PassiveTreeHudState {
    return {
      status,
      enabled: true,
      visible: false,
      mode: context.guide?.mode,
      sourceLabel: context.guide?.sourceLabel,
      className: context.guide?.className,
      classStartNodeId: context.guide?.classStartNodeId,
      message,
      path: [],
    };
  }

  private async capturePoeWindow(): Promise<PoeWindowCapture> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: captureThumbnailSize(this.options.captureWidth),
      fetchWindowIcons: false,
    });
    const source = sources
      .filter((candidate) => isPathOfExileWindowName(candidate.name) && !candidate.thumbnail.isEmpty())
      .sort((left, right) => {
        const leftSize = left.thumbnail.getSize();
        const rightSize = right.thumbnail.getSize();
        return rightSize.width * rightSize.height - leftSize.width * leftSize.height;
      })[0];
    if (!source) {
      if (sources.some((candidate) => isPathOfExileWindowName(candidate.name))) throw new Error('POE_CAPTURE_EMPTY');
      throw new Error('POE_NOT_RUNNING');
    }
    const capture = source.thumbnail.getSize();
    if (capture.width < 240 || capture.height < 120) throw new Error(`POE_CAPTURE_SMALL:${capture.width}x${capture.height}`);
    return {
      bitmap: source.thumbnail.toBitmap(),
      capture,
      ...(source.display_id ? { displayId: source.display_id } : {}),
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
    if (!guide || !snapshot || !context.pathPreview || guide.mode !== 'stage') return [];
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

  private visibleState(context: PassiveTreeHudContext, projection: ProjectionContext, capture: PoeWindowCapture): PassiveTreeHudState {
    const guide = context.guide!;
    const snapshot = context.snapshot!;
    const pathPoints = guide.mode === 'exact' ? this.exactPath(context, projection) : this.stagePath(context, projection);
    const targetPoint = guide.target && passiveHudScopeForNode(snapshot, guide.target.nodeId) === projection.scopeKey
      ? passiveHudTarget(snapshot, guide.target.nodeId)
      : undefined;
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
      message: `Passive tree positively matched. Full-zoom calibrated projection active. ${RECENTER_HOTKEY} recentres on the class/Ascendancy start.`,
      confidence: 1,
      displayId: projection.display.id,
      displayBounds: { ...projection.display.bounds },
      captureSize: { ...capture.capture },
      target,
      path: pathPoints,
      lastLockedAt: new Date().toISOString(),
    };
  }

  private async recenterAtCursor(): Promise<void> {
    if (this.stopped) return;
    const context = this.options.context();
    const idle = this.eligibilityState(context);
    if (idle && idle.status !== 'waiting-point') {
      this.emit(idle);
      return;
    }
    const snapshot = context.snapshot;
    const guide = context.guide;
    const scopeKey = targetScope(context);
    if (!snapshot || !guide || !scopeKey || !hasPassiveTreeGeometry(snapshot)) return;
    const anchor = scopeAnchor(snapshot, guide, scopeKey);
    if (!anchor) {
      this.emit(this.waitingTreeState(context, 'Calibration failed closed because the current tree scope has no fixed class/Ascendancy start anchor.'));
      return;
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.consecutiveTreeMatches = 0;
    this.emit(this.waitingTreeState(context, 'Calibrating Passive Tree HUD from the visible passive-tree UI...'));
    try {
      // The HUD state above hides our overlay before we take the reference.
      await new Promise((resolve) => setTimeout(resolve, 60));
      const first = await this.capturePoeWindow();
      if (!captureDisplayMatches(first, display)) {
        this.emit(this.waitingTreeState(context, 'Calibration rejected: Path of Exile is captured from a different display than the class-start point. Move PoE to this display and try again.'));
        return;
      }
      const signature = createPassiveTreeScreenSignature(first.bitmap, first.capture.width, first.capture.height);
      if (!signature || Math.max(...signature.values) - Math.min(...signature.values) < 12) {
        this.emit(this.waitingTreeState(context, 'Calibration rejected: the passive-tree UI reference was missing or too flat. Keep the passive tree open and try again.'));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      const second = await this.capturePoeWindow();
      if (!captureDisplayMatches(second, display) || !captureAspectStable(captureAspect(first), second)) {
        this.emit(this.waitingTreeState(context, 'Calibration rejected because the Path of Exile capture changed display or shape during sampling.'));
        return;
      }
      const stability = matchPassiveTreeScreenSignature(signature, second.bitmap, second.capture.width, second.capture.height);
      if (!stability.matched) {
        this.emit(this.waitingTreeState(context, 'Calibration rejected: the top-centre passive-tree UI was not stable. Keep the tree open and fully zoomed out, then try again.'));
        return;
      }

      const key = calibrationKey(display, scopeKey);
      const existing = this.calibrations[key];
      const scale = existing?.scale ?? fullZoomScale(display);
      const cursor = screen.getCursorScreenPoint();
      const localX = cursor.x - display.bounds.x;
      const localY = cursor.y - display.bounds.y;
      this.calibrations[key] = {
        scale,
        offsetX: localX - anchor.x * scale,
        offsetY: localY - anchor.y * scale,
        ySign: 1,
        captureAspect: captureAspect(first),
        screenCheck: signature,
        updatedAt: new Date().toISOString(),
      };
      this.consecutiveTreeMatches = REQUIRED_TREE_MATCHES;
      await this.saveCalibrations();
      this.options.log?.info(`Passive Tree HUD calibrated for ${key} at scale ${scale.toFixed(4)} from ${first.capture.width}x${first.capture.height} capture.`);
      this.poke();
    } catch (error) {
      if (String(error).includes('POE_NOT_RUNNING')) {
        this.emit(this.waitingTreeState(context, 'Calibration needs Path of Exile running with the passive tree open.'));
      } else {
        this.options.log?.warn('Passive Tree HUD calibration failed.', error);
        this.emit({ status: 'capture-error', enabled: true, visible: false, message: `Passive Tree HUD calibration failed safely: ${String(error)}`, path: [] });
      }
    }
  }

  private adjustScale(factor: number): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    const snapshot = context.snapshot;
    const guide = context.guide;
    if (!projection || !snapshot || !guide) return;
    const anchor = scopeAnchor(snapshot, guide, projection.scopeKey);
    if (!anchor) return;
    const anchorScreen = projectPassiveTreePoint(projection.transform, anchor);
    const scale = clamp(projection.transform.scale * factor, MIN_SCALE, MAX_SCALE);
    this.calibrations[projection.calibrationKey] = {
      ...projection.calibration,
      scale,
      offsetX: anchorScreen.x - anchor.x * scale,
      offsetY: anchorScreen.y - anchor.y * scale,
      updatedAt: new Date().toISOString(),
    };
    void this.saveCalibrations();
    this.poke();
  }

  private resetCalibration(): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    if (!projection) return;
    delete this.calibrations[projection.calibrationKey];
    this.consecutiveTreeMatches = 0;
    void this.saveCalibrations();
    this.emit(this.waitingTreeState(context, `Calibration cleared. Open the passive tree, fully zoom out, hover the class/Ascendancy start circle, then press ${RECENTER_HOTKEY}.`));
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.polling || this.calibrating) return;
    this.polling = true;
    try {
      const context = this.options.context();
      const idle = this.eligibilityState(context);
      if (idle) {
        this.consecutiveTreeMatches = 0;
        this.emit(idle);
        return;
      }

      const projection = this.projectionContext(context);
      if (!projection) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `One-time calibration required. Use Borderless/Windowed Fullscreen, open the passive tree, fully zoom out, hover the ${context.guide?.className ?? 'class/Ascendancy'} start circle and press ${RECENTER_HOTKEY}.`));
        return;
      }

      const capture = await this.capturePoeWindow();
      if (!captureDisplayMatches(capture, projection.display)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Passive Tree HUD hidden because Path of Exile moved to another display. Hover the class/Ascendancy start and press ${RECENTER_HOTKEY} to recalibrate there.`));
        return;
      }
      if (!captureAspectStable(projection.calibration.captureAspect, capture)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Passive Tree HUD hidden because the PoE capture shape changed after calibration. Restore Borderless/Windowed Fullscreen or press ${RECENTER_HOTKEY} to recalibrate.`));
        return;
      }

      const match = matchPassiveTreeScreenSignature(
        projection.calibration.screenCheck,
        capture.bitmap,
        capture.capture.width,
        capture.capture.height,
      );
      if (!match.matched) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, 'Path of Exile is running. Waiting for the calibrated passive skill tree UI to be visible.'));
        return;
      }

      this.consecutiveTreeMatches += 1;
      if (this.consecutiveTreeMatches < REQUIRED_TREE_MATCHES) {
        this.emit(this.waitingTreeState(context, 'Passive-tree UI candidate found; confirming before showing the HUD.', 'searching'));
        return;
      }
      this.emit(this.visibleState(context, projection, capture));
    } catch (error) {
      this.consecutiveTreeMatches = 0;
      if (String(error).includes('POE_NOT_RUNNING')) {
        this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is not running. Passive Tree HUD capture is suspended.'));
      } else if (String(error).includes('POE_CAPTURE_EMPTY')) {
        this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is running, but its window capture is unavailable.'));
      } else {
        this.options.log?.warn('Passive Tree HUD screen check failed.', error);
        this.emit({
          status: 'capture-error', enabled: true, visible: false,
          message: `Passive Tree HUD could not inspect the Path of Exile window safely: ${String(error)}`,
          path: [],
        });
      }
    } finally {
      this.polling = false;
      if (this.recenterQueued) void this.runQueuedRecenter();
      else this.schedule();
    }
  }
}
