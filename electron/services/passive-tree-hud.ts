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
  passiveAscendancyNameFromScope,
  passiveAscendancyStart,
  type PassiveTreeScopeKey,
  type PassiveTreeSnapshot,
} from '../../src/core/passive-data';
import type { PassiveTreeGuidePlan } from '../../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudState } from '../../src/core/passive-tree-hud-state';
import {
  createPassiveTreeScreenSignature,
  matchPassiveTreeScreenSignature,
  validatePassiveTreeScreenSignature,
  type PassiveTreeScreenSignature,
} from '../../src/core/passive-tree-screen-check';
import {
  applyPassiveTreeFrameMotion,
  trackPassiveTreeFrameMotion,
  type PassiveTreeFrameMotion,
} from '../../src/core/passive-tree-frame-tracking';

export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  /** Manager/UI focus suppresses the game HUD completely. */
  appWindowFocused?: boolean;
  /** Kept in the runtime context for other guidance surfaces. Target Lock always shows the next node. */
  characterLevel?: number;
  expectedQuestPassivePoints?: number;
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
  displayId?: string;
}

interface StoredKeyframe {
  width: number;
  height: number;
  bitmapBase64: string;
}

interface StoredCalibration {
  scale: number;
  offsetX: number;
  offsetY: number;
  ySign: 1 | -1;
  captureAspect: number;
  screenCheck: PassiveTreeScreenSignature;
  keyframe?: StoredKeyframe;
  updatedAt: string;
}

interface CalibrationDocument {
  schemaVersion: 3;
  calibrations: Record<string, StoredCalibration>;
}

interface ProjectionContext {
  display: Display;
  scopeKey: PassiveTreeScopeKey;
  calibrationKey: string;
  transform: PassiveTreeTransform;
  calibration: StoredCalibration;
}

interface TrackingDiagnostics {
  confidence: number;
  inliers: number;
  rms: number;
}

const RECENTER_HOTKEY = 'CommandOrControl+Shift+C';
const RESET_HOTKEY = 'CommandOrControl+Shift+0';
const CALIBRATION_FILE = 'passive-tree-hud-calibration.json';
const HOTKEY_REPAIR_INTERVAL_MS = 2_000;
const DEFAULT_CAPTURE_WIDTH = 480;
const DEFAULT_SEARCH_INTERVAL = 700;
const DEFAULT_LOCKED_INTERVAL = 180;
const MIN_SCALE = 0.004;
const MAX_SCALE = 1.2;
const REQUIRED_TREE_MATCHES = 2;
const MAX_CAPTURE_ASPECT_DRIFT = 0.06;
const REFERENCE_SAVE_INTERVAL_MS = 5_000;
const MAX_KEYFRAME_BASE64_LENGTH = 6_000_000;

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

function validKeyframe(value: unknown): StoredKeyframe | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (!Number.isInteger(item.width) || !Number.isInteger(item.height)) return undefined;
  const width = Number(item.width);
  const height = Number(item.height);
  if (width < 240 || width > 1_000 || height < 120 || height > 1_000) return undefined;
  if (typeof item.bitmapBase64 !== 'string' || !item.bitmapBase64.length || item.bitmapBase64.length > MAX_KEYFRAME_BASE64_LENGTH) return undefined;
  return { width, height, bitmapBase64: item.bitmapBase64 };
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
    keyframe: validKeyframe(item.keyframe),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  };
}

function targetScope(context: PassiveTreeHudContext): PassiveTreeScopeKey | undefined {
  const nodeId = context.guide?.target?.nodeId;
  return passiveHudScopeForNode(context.snapshot, nodeId);
}

function scopeAnchor(context: PassiveTreeHudContext, scopeKey: PassiveTreeScopeKey) {
  const snapshot = context.snapshot;
  const guide = context.guide;
  if (!snapshot || !guide) return undefined;
  if (scopeKey === 'base') return passiveHudTarget(snapshot, guide.classStartNodeId);
  const name = passiveAscendancyNameFromScope(scopeKey);
  return passiveFixedNodePoint(name ? passiveAscendancyStart(snapshot, name) : undefined);
}

/** PoE 1 maximum zoom-out maps roughly 10,000 tree units to display height. */
function seedScale(display: Display): number {
  return clamp(display.bounds.height / 10_000, MIN_SCALE, MAX_SCALE);
}

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

function cloneCapture(capture: PoeWindowCapture): PoeWindowCapture {
  return {
    bitmap: Buffer.from(capture.bitmap),
    capture: { ...capture.capture },
    ...(capture.displayId ? { displayId: capture.displayId } : {}),
  };
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
    state.confidence === undefined ? '' : state.confidence.toFixed(3),
    state.inliers ?? '',
    state.rms === undefined ? '' : state.rms.toFixed(2),
    target?.nodeId ?? '',
    target ? Math.round(target.x) : '',
    target ? Math.round(target.y) : '',
    target?.offscreen ?? '',
  ].join(';');
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
  private readonly liveTransforms = new Map<string, PassiveTreeTransform>();
  private readonly trustedFrames = new Map<string, PoeWindowCapture>();
  private readonly diagnostics = new Map<string, TrackingDiagnostics>();
  private readonly trackingFailures = new Map<string, number>();
  private readonly lastReferenceSave = new Map<string, number>();
  private readonly dirtyReferences = new Set<string>();
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
    for (const accelerator of [RECENTER_HOTKEY, RESET_HOTKEY]) {
      if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
    }
    void this.saveCalibrations();
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
      if (parsed?.schemaVersion !== 3 || !parsed.calibrations || typeof parsed.calibrations !== 'object') return;
      const next: Record<string, StoredCalibration> = {};
      for (const [key, value] of Object.entries(parsed.calibrations)) {
        const calibration = validCalibration(value);
        if (calibration) next[key] = calibration;
      }
      this.calibrations = next;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.options.log?.warn('Passive Target Lock calibration could not be loaded; starting uncalibrated.', error);
      }
    }
  }

  private async saveCalibrations(): Promise<void> {
    try {
      const filePath = this.calibrationPath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      const document: CalibrationDocument = { schemaVersion: 3, calibrations: this.calibrations };
      await fs.writeFile(temporary, JSON.stringify(document, null, 2), 'utf8');
      await fs.rename(temporary, filePath);
    } catch (error) {
      this.options.log?.warn('Passive Target Lock calibration could not be saved.', error);
    }
  }

  private ensureHotkeys(): void {
    if (this.stopped || !app.isReady()) return;
    const bindings: Array<[string, () => void]> = [
      [RECENTER_HOTKEY, () => this.queueRecenter()],
      [RESET_HOTKEY, () => this.resetCalibration()],
    ];
    for (const [accelerator, callback] of bindings) {
      if (globalShortcut.isRegistered(accelerator)) continue;
      if (!globalShortcut.register(accelerator, callback)) this.options.log?.warn(`Passive Target Lock hotkey could not be registered: ${accelerator}`);
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
    const activelyTracking = this.state.status === 'locked' || this.state.status === 'searching';
    const interval = delay ?? (activelyTracking ? this.options.lockedIntervalMs : this.options.searchIntervalMs);
    this.timer = setTimeout(() => { void this.poll(); }, interval);
    this.timer.unref?.();
  }

  private queueRecenter(): void {
    if (this.stopped) return;
    this.recenterQueued = true;
    if (this.polling || this.calibrating) {
      this.options.log?.info('Passive Target Lock anchor capture queued until the current window capture completes.');
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

  private projectionContext(context: PassiveTreeHudContext, preferredDisplayId?: string): ProjectionContext | undefined {
    const scopeKey = targetScope(context);
    if (!scopeKey) return undefined;
    const displays = screen.getAllDisplays();
    const preferredDisplay = preferredDisplayId ? displays.find((display) => String(display.id) === preferredDisplayId) : undefined;
    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const ordered = [preferredDisplay, cursorDisplay, ...displays]
      .filter((display): display is Display => Boolean(display))
      .filter((display, index, array) => array.findIndex((candidate) => candidate.id === display.id) === index);
    for (const display of ordered) {
      const key = calibrationKey(display, scopeKey);
      const calibration = this.calibrations[key];
      if (!calibration) continue;
      return {
        display,
        scopeKey,
        calibrationKey: key,
        transform: this.liveTransforms.get(key) ?? {
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
      return { ...passiveTreeHudIdle(true), status: 'waiting-tree', message: 'Passive Target Lock is paused while the ExileQuesting manager is focused.' };
    }
    const guide = context.guide;
    if (!guide) {
      return { ...passiveTreeHudIdle(true), status: 'waiting-build', message: 'Import and activate a build with passive progression.' };
    }
    if (!guide.target) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'unsupported-target',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: guide.stageTargets.length
          ? 'This PoB stage does not provide a safe exact next-click order. Target Lock refuses to guess between stage nodes.'
          : guide.message,
      };
    }
    if (!hasPassiveTreeGeometry(context.snapshot)) {
      return { ...passiveTreeHudIdle(true), status: 'missing-geometry', message: 'Passive Target Lock needs the geometry-enabled PoE passive snapshot.' };
    }
    if (!passiveHudTarget(context.snapshot, guide.target.nodeId)) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'unsupported-target',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: `PoB target node ${guide.target.nodeId} has no fixed passive-tree geometry. Target Lock refuses to guess.`,
      };
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

  private keyframeCapture(projection: ProjectionContext): PoeWindowCapture | undefined {
    const cached = this.trustedFrames.get(projection.calibrationKey);
    if (cached) return cached;
    const stored = projection.calibration.keyframe;
    if (!stored) return undefined;
    try {
      const bitmap = Buffer.from(stored.bitmapBase64, 'base64');
      if (bitmap.length < stored.width * stored.height * 4) return undefined;
      const restored: PoeWindowCapture = {
        bitmap,
        capture: { width: stored.width, height: stored.height },
        displayId: String(projection.display.id),
      };
      this.trustedFrames.set(projection.calibrationKey, restored);
      return restored;
    } catch {
      return undefined;
    }
  }

  private async persistReference(projection: ProjectionContext, frame: PoeWindowCapture, force = false): Promise<void> {
    const key = projection.calibrationKey;
    if (!this.dirtyReferences.has(key) && !force) return;
    const now = Date.now();
    const last = this.lastReferenceSave.get(key) ?? 0;
    if (!force && now - last < REFERENCE_SAVE_INTERVAL_MS) return;
    const transform = this.liveTransforms.get(key) ?? projection.transform;
    this.calibrations[key] = {
      ...projection.calibration,
      ...transform,
      keyframe: {
        width: frame.capture.width,
        height: frame.capture.height,
        bitmapBase64: frame.bitmap.toString('base64'),
      },
      updatedAt: new Date().toISOString(),
    };
    this.lastReferenceSave.set(key, now);
    this.dirtyReferences.delete(key);
    await this.saveCalibrations();
  }

  private visibleState(context: PassiveTreeHudContext, projection: ProjectionContext, capture: PoeWindowCapture): PassiveTreeHudState {
    const guide = context.guide!;
    const snapshot = context.snapshot!;
    const targetPoint = passiveHudTarget(snapshot, guide.target!.nodeId)!;
    const projectedTarget = projectPassiveTreePoint(projection.transform, targetPoint);
    const edge = edgeIndicatorForTarget(projectedTarget, projection.display.bounds.width, projection.display.bounds.height);
    const diagnostics = this.diagnostics.get(projection.calibrationKey);
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
      message: `Target Lock is glued to PoB node ${guide.target!.nodeId}. Vision only follows passive-tree pan and zoom.`,
      confidence: diagnostics?.confidence ?? 1,
      inliers: diagnostics?.inliers,
      rms: diagnostics?.rms,
      displayId: projection.display.id,
      displayBounds: { ...projection.display.bounds },
      captureSize: { ...capture.capture },
      target: {
        nodeId: guide.target!.nodeId,
        name: guide.target!.nodeName,
        kind: guide.target!.nodeKind,
        x: projectedTarget.x,
        y: projectedTarget.y,
        markerRadius: guide.target!.type === 'refund' ? 30 : 28,
        operation: guide.target!.type,
        index: guide.target!.index,
        total: guide.target!.total,
        checkpoint: guide.target!.checkpoint,
        offscreen: edge.visible,
        arrowX: edge.visible ? edge.x : undefined,
        arrowY: edge.visible ? edge.y : undefined,
        arrowAngle: edge.visible ? edge.angle : undefined,
      },
      path: [],
      lastLockedAt: new Date().toISOString(),
    };
  }

  private async recenterAtCursor(): Promise<void> {
    if (this.stopped) return;
    const context = this.options.context();
    const idle = this.eligibilityState(context);
    if (idle) {
      this.emit(idle);
      return;
    }
    const snapshot = context.snapshot;
    const guide = context.guide;
    const scopeKey = targetScope(context);
    if (!snapshot || !guide?.target || !scopeKey || !hasPassiveTreeGeometry(snapshot)) return;
    const anchor = scopeAnchor(context, scopeKey);
    if (!anchor) {
      this.emit(this.waitingTreeState(context, 'Anchor capture failed closed because the current tree scope has no fixed class/Ascendancy start node.'));
      return;
    }

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.consecutiveTreeMatches = 0;
    this.emit(this.waitingTreeState(context, 'Capturing Target Lock anchor. Keep the passive tree at maximum zoom-out and the cursor centred on the class/Ascendancy start node.'));
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const first = await this.capturePoeWindow();
      if (!captureDisplayMatches(first, display)) {
        this.emit(this.waitingTreeState(context, 'Anchor rejected: Path of Exile is captured from a different display than the cursor.'));
        return;
      }
      const signature = createPassiveTreeScreenSignature(first.bitmap, first.capture.width, first.capture.height);
      if (!signature || Math.max(...signature.values) - Math.min(...signature.values) < 12) {
        this.emit(this.waitingTreeState(context, 'Anchor rejected: the passive-tree UI reference was missing or too flat. Keep the passive tree open and try again.'));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
      const second = await this.capturePoeWindow();
      if (!captureDisplayMatches(second, display) || !captureAspectStable(captureAspect(first), second)) {
        this.emit(this.waitingTreeState(context, 'Anchor rejected because the Path of Exile capture changed display or shape during sampling.'));
        return;
      }
      const stability = matchPassiveTreeScreenSignature(signature, second.bitmap, second.capture.width, second.capture.height);
      if (!stability.matched) {
        this.emit(this.waitingTreeState(context, 'Anchor rejected: the passive-tree UI was not stable. Keep the tree open at maximum zoom-out and try again.'));
        return;
      }

      const scale = seedScale(display);
      const cursor = screen.getCursorScreenPoint();
      const localX = cursor.x - display.bounds.x;
      const localY = cursor.y - display.bounds.y;
      const transform: PassiveTreeTransform = {
        scale,
        offsetX: localX - anchor.x * scale,
        offsetY: localY - anchor.y * scale,
        ySign: 1,
      };
      const key = calibrationKey(display, scopeKey);
      const calibration: StoredCalibration = {
        ...transform,
        captureAspect: captureAspect(first),
        screenCheck: signature,
        keyframe: {
          width: second.capture.width,
          height: second.capture.height,
          bitmapBase64: second.bitmap.toString('base64'),
        },
        updatedAt: new Date().toISOString(),
      };
      this.calibrations[key] = calibration;
      this.liveTransforms.set(key, transform);
      this.trustedFrames.set(key, cloneCapture(second));
      this.diagnostics.set(key, { confidence: 1, inliers: 0, rms: 0 });
      this.trackingFailures.set(key, 0);
      this.lastReferenceSave.set(key, Date.now());
      this.dirtyReferences.delete(key);
      this.consecutiveTreeMatches = REQUIRED_TREE_MATCHES;
      await this.saveCalibrations();
      this.options.log?.info(`Passive Target Lock anchored for ${key}; target node identity will remain build-controlled while image motion follows pan/zoom.`);
      this.poke();
    } catch (error) {
      if (String(error).includes('POE_NOT_RUNNING')) {
        this.emit(this.waitingTreeState(context, 'Target Lock needs Path of Exile running with the passive tree open.'));
      } else {
        this.options.log?.warn('Passive Target Lock anchor capture failed.', error);
        this.emit({ status: 'capture-error', enabled: true, visible: false, message: `Passive Target Lock anchor failed safely: ${String(error)}`, path: [] });
      }
    }
  }

  private resetCalibration(): void {
    const context = this.options.context();
    const projection = this.projectionContext(context);
    if (!projection) return;
    const key = projection.calibrationKey;
    delete this.calibrations[key];
    this.liveTransforms.delete(key);
    this.trustedFrames.delete(key);
    this.diagnostics.delete(key);
    this.trackingFailures.delete(key);
    this.lastReferenceSave.delete(key);
    this.dirtyReferences.delete(key);
    this.consecutiveTreeMatches = 0;
    void this.saveCalibrations();
    this.emit(this.waitingTreeState(context, `Target Lock anchor cleared. Fully zoom out the passive tree, hover the class/Ascendancy start node once, then press ${RECENTER_HOTKEY}.`));
  }

  private trackProjection(projection: ProjectionContext, capture: PoeWindowCapture): ProjectionContext | undefined {
    const previous = this.keyframeCapture(projection);
    if (!previous) return undefined;
    if (previous.capture.width !== capture.capture.width || previous.capture.height !== capture.capture.height) return undefined;
    const failures = this.trackingFailures.get(projection.calibrationKey) ?? 0;
    const motion: PassiveTreeFrameMotion | undefined = trackPassiveTreeFrameMotion(
      previous.bitmap,
      capture.bitmap,
      capture.capture.width,
      capture.capture.height,
      {
        wide: failures > 0,
        searchRadiusPx: failures > 1 ? 96 : 78,
        minimumConfidence: failures > 0 ? 0.55 : 0.6,
      },
    );
    if (!motion) return undefined;
    const transform = applyPassiveTreeFrameMotion(
      projection.transform,
      motion,
      capture.capture,
      { width: projection.display.bounds.width, height: projection.display.bounds.height },
    );
    if (!finite(transform.scale) || transform.scale < MIN_SCALE || transform.scale > MAX_SCALE
      || !finite(transform.offsetX) || !finite(transform.offsetY)) return undefined;
    this.liveTransforms.set(projection.calibrationKey, transform);
    this.trustedFrames.set(projection.calibrationKey, cloneCapture(capture));
    this.diagnostics.set(projection.calibrationKey, {
      confidence: motion.confidence,
      inliers: motion.inliers,
      rms: motion.rms,
    });
    this.trackingFailures.set(projection.calibrationKey, 0);
    this.dirtyReferences.add(projection.calibrationKey);
    const tracked: ProjectionContext = { ...projection, transform };
    void this.persistReference(tracked, capture);
    return tracked;
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

      const capture = await this.capturePoeWindow();
      const projection = this.projectionContext(context, capture.displayId);
      if (!projection) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `One-time Target Lock anchor required. Fully zoom out the passive tree, hover the ${context.guide?.className ?? 'class/Ascendancy'} start node and press ${RECENTER_HOTKEY}.`));
        return;
      }
      if (!captureDisplayMatches(capture, projection.display)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Target Lock is hidden because Path of Exile moved to another display. Re-anchor once with ${RECENTER_HOTKEY} on that display.`));
        return;
      }
      if (!captureAspectStable(projection.calibration.captureAspect, capture)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Target Lock is hidden because the PoE window shape changed. Fully zoom out and press ${RECENTER_HOTKEY} once to refresh the anchor.`));
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
        const trusted = this.trustedFrames.get(projection.calibrationKey);
        if (trusted && this.dirtyReferences.has(projection.calibrationKey)) void this.persistReference(projection, trusted, true);
        this.emit(this.waitingTreeState(context, 'Path of Exile is running. Waiting for the passive skill tree UI to be visible.'));
        return;
      }

      this.consecutiveTreeMatches += 1;
      if (this.consecutiveTreeMatches < REQUIRED_TREE_MATCHES) {
        this.emit(this.waitingTreeState(context, 'Passive-tree UI found; confirming before showing the target crosshair.', 'searching'));
        return;
      }

      const tracked = this.trackProjection(projection, capture);
      if (!tracked) {
        const failures = (this.trackingFailures.get(projection.calibrationKey) ?? 0) + 1;
        this.trackingFailures.set(projection.calibrationKey, failures);
        const message = failures >= 3
          ? `Target Lock refused an uncertain camera jump. The crosshair is hidden instead of guessing. Fully zoom out, hover the class/Ascendancy start node and press ${RECENTER_HOTKEY} once to recover.`
          : 'Target Lock lost confidence in passive-tree motion. The crosshair is hidden while it safely reacquires the same tree view.';
        this.emit(this.waitingTreeState(context, message, 'searching'));
        return;
      }

      this.emit(this.visibleState(context, tracked, capture));
    } catch (error) {
      this.consecutiveTreeMatches = 0;
      if (String(error).includes('POE_NOT_RUNNING')) {
        this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is not running. Passive Target Lock capture is suspended.'));
      } else if (String(error).includes('POE_CAPTURE_EMPTY')) {
        this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is running, but its window capture is unavailable.'));
      } else {
        this.options.log?.warn('Passive Target Lock screen check failed.', error);
        this.emit({
          status: 'capture-error',
          enabled: true,
          visible: false,
          message: `Passive Target Lock could not inspect the Path of Exile window safely: ${String(error)}`,
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
