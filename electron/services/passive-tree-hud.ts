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
import {
  comparePassiveTargetPatches,
  passiveTargetOperationLooksComplete,
  passiveTargetPatchIsGrossMismatch,
  samplePassiveTargetPatch,
  type PassiveTargetPatch,
} from '../../src/core/passive-target-visual';
import {
  adaptPassiveTreeTransformToDisplay,
  passiveTreeTransformsAreDistinct,
} from '../../src/core/passive-tree-reference-bank';

export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  appWindowFocused?: boolean;
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

export interface PassiveTargetOperationDetected {
  nodeId: number;
  operation: 'allocate' | 'refund';
  confidence: number;
}

export interface PassiveTreeHudServiceOptions {
  context: () => PassiveTreeHudContext;
  onState: (state: PassiveTreeHudState) => void;
  /** Returns true only when the build cursor really advanced. */
  onTargetOperationDetected?: (event: PassiveTargetOperationDetected) => boolean | Promise<boolean>;
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

interface StoredReferenceFrame extends StoredKeyframe, PassiveTreeTransform {
  capturedAt: string;
}

interface StoredCalibration extends PassiveTreeTransform {
  captureAspect: number;
  screenCheck: PassiveTreeScreenSignature;
  keyframe?: StoredKeyframe;
  references?: StoredReferenceFrame[];
  displayWidth?: number;
  displayHeight?: number;
  displayScaleFactor?: number;
  scopeKey?: PassiveTreeScopeKey;
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

interface RecenterRequest {
  cursor: { x: number; y: number };
  displayId: number;
}

interface ReferenceCandidate {
  capture: PoeWindowCapture;
  transform: PassiveTreeTransform;
}

interface TrackingResult {
  projection: ProjectionContext;
  motion: PassiveTreeFrameMotion;
  mode: 'stationary' | 'motion' | 'reacquired';
}

interface TargetVisualState {
  identity: string;
  reference?: PassiveTargetPatch;
  verification: 'learning' | 'verified' | 'changed' | 'mismatch';
  stableChangeCount: number;
  mismatchCount: number;
  pendingOperation: boolean;
}

const RECENTER_HOTKEY = 'CommandOrControl+Shift+C';
const RESET_HOTKEY = 'CommandOrControl+Shift+0';
const CALIBRATION_FILE = 'passive-tree-hud-calibration.json';
const HOTKEY_REPAIR_INTERVAL_MS = 500;
const DEFAULT_CAPTURE_WIDTH = 480;
const DEFAULT_SEARCH_INTERVAL = 700;
const DEFAULT_LOCKED_INTERVAL = 180;
const MIN_SCALE = 0.004;
const MAX_SCALE = 1.2;
const REQUIRED_TREE_MATCHES = 2;
const MAX_CAPTURE_ASPECT_DRIFT = 0.06;
const REFERENCE_SAVE_INTERVAL_MS = 5_000;
const MAX_KEYFRAME_BASE64_LENGTH = 6_000_000;
const MAX_REFERENCE_FRAMES = 5;
const AUTO_ADVANCE_CONFIRMATIONS = 3;
const LOCAL_MISMATCH_CONFIRMATIONS = 3;

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

function validReference(value: unknown): StoredReferenceFrame | undefined {
  const keyframe = validKeyframe(value);
  if (!keyframe || !value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (!finite(item.scale) || !finite(item.offsetX) || !finite(item.offsetY) || item.scale < MIN_SCALE || item.scale > MAX_SCALE) return undefined;
  return {
    ...keyframe,
    scale: item.scale,
    offsetX: item.offsetX,
    offsetY: item.offsetY,
    ySign: item.ySign === -1 ? -1 : 1,
    capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : new Date(0).toISOString(),
  };
}

function validCalibration(value: unknown): StoredCalibration | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (!finite(item.scale) || !finite(item.offsetX) || !finite(item.offsetY) || !finite(item.captureAspect)) return undefined;
  if (item.scale < MIN_SCALE || item.scale > MAX_SCALE || item.captureAspect < 0.5 || item.captureAspect > 5) return undefined;
  const screenCheck = validatePassiveTreeScreenSignature(item.screenCheck);
  if (!screenCheck) return undefined;
  const references = Array.isArray(item.references)
    ? item.references.map(validReference).filter((entry): entry is StoredReferenceFrame => Boolean(entry)).slice(0, MAX_REFERENCE_FRAMES)
    : undefined;
  const scopeKey = typeof item.scopeKey === 'string' && (item.scopeKey === 'base' || item.scopeKey.startsWith('ascendancy:'))
    ? item.scopeKey as PassiveTreeScopeKey
    : undefined;
  return {
    scale: item.scale,
    offsetX: item.offsetX,
    offsetY: item.offsetY,
    ySign: item.ySign === -1 ? -1 : 1,
    captureAspect: item.captureAspect,
    screenCheck,
    keyframe: validKeyframe(item.keyframe),
    references,
    displayWidth: finite(item.displayWidth) && item.displayWidth > 0 ? item.displayWidth : undefined,
    displayHeight: finite(item.displayHeight) && item.displayHeight > 0 ? item.displayHeight : undefined,
    displayScaleFactor: finite(item.displayScaleFactor) && item.displayScaleFactor > 0 ? item.displayScaleFactor : undefined,
    scopeKey,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString(),
  };
}

function targetScope(context: PassiveTreeHudContext): PassiveTreeScopeKey | undefined {
  return passiveHudScopeForNode(context.snapshot, context.guide?.target?.nodeId);
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

function decodeCapture(frame: StoredKeyframe, displayId: number): PoeWindowCapture | undefined {
  try {
    const bitmap = Buffer.from(frame.bitmapBase64, 'base64');
    if (bitmap.length < frame.width * frame.height * 4) return undefined;
    return { bitmap, capture: { width: frame.width, height: frame.height }, displayId: String(displayId) };
  } catch {
    return undefined;
  }
}

function compassDirection(angle: number): string {
  const names = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
  return names[Math.round(normalized / (Math.PI / 4)) % names.length];
}

function targetMarkerRadius(transform: PassiveTreeTransform, display: Display, operation: 'allocate' | 'refund'): number {
  const ratio = clamp(transform.scale / Math.max(MIN_SCALE, seedScale(display)), 0.72, 3.2);
  const base = operation === 'refund' ? 30 : 28;
  return clamp(base * Math.pow(ratio, 0.78), 24, 54);
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
    state.trackingMode ?? '',
    state.targetVerification ?? '',
    state.autoAdvanceArmed ?? '',
    target?.nodeId ?? '',
    target ? Math.round(target.x) : '',
    target ? Math.round(target.y) : '',
    target?.offscreen ?? '',
    target?.offscreenDistancePx ?? '',
  ].join(';');
}

export class PassiveTreeHudService {
  private readonly options: Required<Pick<PassiveTreeHudServiceOptions, 'captureWidth' | 'searchIntervalMs' | 'lockedIntervalMs'>> & PassiveTreeHudServiceOptions;
  private stopped = true;
  private polling = false;
  private calibrating = false;
  private recenterRequest?: RecenterRequest;
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
  private targetVisual?: TargetVisualState;
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
    this.recenterRequest = undefined;
    this.targetVisual = undefined;
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
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    this.recenterRequest = { cursor: { ...cursor }, displayId: display.id };
    if (this.polling || this.calibrating) {
      this.options.log?.info('Passive Target Lock anchor capture queued with the cursor position frozen at hotkey press.');
      return;
    }
    void this.runQueuedRecenter();
  }

  private async runQueuedRecenter(): Promise<void> {
    if (this.stopped || this.polling || this.calibrating || !this.recenterRequest) return;
    const request = this.recenterRequest;
    this.recenterRequest = undefined;
    this.calibrating = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      await this.recenterAtCursor(request);
    } finally {
      this.calibrating = false;
      if (this.stopped) return;
      if (this.recenterRequest) void this.runQueuedRecenter();
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
    if (!guide) return { ...passiveTreeHudIdle(true), status: 'waiting-build', message: 'Import and activate a build with passive progression.' };
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
    return { bitmap: source.thumbnail.toBitmap(), capture, ...(source.display_id ? { displayId: source.display_id } : {}) };
  }

  private latestReference(projection: ProjectionContext): ReferenceCandidate | undefined {
    const cached = this.trustedFrames.get(projection.calibrationKey);
    if (cached) return { capture: cached, transform: projection.transform };
    const stored = projection.calibration.keyframe;
    if (!stored) return undefined;
    const capture = decodeCapture(stored, projection.display.id);
    if (!capture) return undefined;
    this.trustedFrames.set(projection.calibrationKey, capture);
    return { capture, transform: projection.transform };
  }

  private referenceBank(projection: ProjectionContext): ReferenceCandidate[] {
    const references: ReferenceCandidate[] = [];
    const latest = this.latestReference(projection);
    if (latest) references.push(latest);
    for (const stored of projection.calibration.references ?? []) {
      const capture = decodeCapture(stored, projection.display.id);
      if (!capture) continue;
      references.push({
        capture,
        transform: { scale: stored.scale, offsetX: stored.offsetX, offsetY: stored.offsetY, ySign: stored.ySign },
      });
    }
    return references;
  }

  private async persistReference(projection: ProjectionContext, frame: PoeWindowCapture, force = false): Promise<void> {
    const key = projection.calibrationKey;
    if (!this.dirtyReferences.has(key) && !force) return;
    const now = Date.now();
    const last = this.lastReferenceSave.get(key) ?? 0;
    if (!force && now - last < REFERENCE_SAVE_INTERVAL_MS) return;
    const transform = this.liveTransforms.get(key) ?? projection.transform;
    const encoded = frame.bitmap.toString('base64');
    const candidate: StoredReferenceFrame = {
      width: frame.capture.width,
      height: frame.capture.height,
      bitmapBase64: encoded,
      ...transform,
      capturedAt: new Date().toISOString(),
    };
    const displaySize = { width: projection.display.bounds.width, height: projection.display.bounds.height };
    const existing = projection.calibration.references ?? [];
    const keepAsDistinct = existing.every((entry) => passiveTreeTransformsAreDistinct(
      transform,
      { scale: entry.scale, offsetX: entry.offsetX, offsetY: entry.offsetY, ySign: entry.ySign },
      displaySize,
    ));
    const references = keepAsDistinct ? [candidate, ...existing].slice(0, MAX_REFERENCE_FRAMES) : existing;
    this.calibrations[key] = {
      ...projection.calibration,
      ...transform,
      captureAspect: captureAspect(frame),
      keyframe: { width: frame.capture.width, height: frame.capture.height, bitmapBase64: encoded },
      references,
      displayWidth: projection.display.bounds.width,
      displayHeight: projection.display.bounds.height,
      displayScaleFactor: projection.display.scaleFactor,
      scopeKey: projection.scopeKey,
      updatedAt: new Date().toISOString(),
    };
    this.lastReferenceSave.set(key, now);
    this.dirtyReferences.delete(key);
    await this.saveCalibrations();
  }

  private solveFromReference(
    projection: ProjectionContext,
    reference: ReferenceCandidate,
    capture: PoeWindowCapture,
    wide: boolean,
  ): { transform: PassiveTreeTransform; motion: PassiveTreeFrameMotion } | undefined {
    if (reference.capture.capture.width !== capture.capture.width || reference.capture.capture.height !== capture.capture.height) return undefined;
    const motion = trackPassiveTreeFrameMotion(
      reference.capture.bitmap,
      capture.bitmap,
      capture.capture.width,
      capture.capture.height,
      { wide, searchRadiusPx: wide ? 104 : 78, minimumConfidence: wide ? 0.62 : 0.6 },
    );
    if (!motion) return undefined;
    const transform = applyPassiveTreeFrameMotion(
      reference.transform,
      motion,
      capture.capture,
      { width: projection.display.bounds.width, height: projection.display.bounds.height },
    );
    if (!finite(transform.scale) || transform.scale < MIN_SCALE || transform.scale > MAX_SCALE || !finite(transform.offsetX) || !finite(transform.offsetY)) return undefined;
    return { transform, motion };
  }

  private solveProjection(projection: ProjectionContext, capture: PoeWindowCapture): TrackingResult | undefined {
    const references = this.referenceBank(projection);
    if (!references.length) return undefined;
    const failures = this.trackingFailures.get(projection.calibrationKey) ?? 0;
    const primary = this.solveFromReference(projection, references[0], capture, failures > 0);
    if (primary) {
      return {
        projection: { ...projection, transform: primary.transform },
        motion: primary.motion,
        mode: primary.motion.stationary ? 'stationary' : 'motion',
      };
    }

    let best: TrackingResult | undefined;
    for (const reference of references.slice(1)) {
      const solved = this.solveFromReference(projection, reference, capture, true);
      if (!solved) continue;
      const candidate: TrackingResult = {
        projection: { ...projection, transform: solved.transform },
        motion: solved.motion,
        mode: 'reacquired',
      };
      if (!best || candidate.motion.confidence > best.motion.confidence
        || (candidate.motion.confidence === best.motion.confidence && candidate.motion.inliers > best.motion.inliers)) best = candidate;
    }
    return best;
  }

  private commitTracking(result: TrackingResult, capture: PoeWindowCapture): void {
    const key = result.projection.calibrationKey;
    this.liveTransforms.set(key, result.projection.transform);
    this.trustedFrames.set(key, cloneCapture(capture));
    this.diagnostics.set(key, { confidence: result.motion.confidence, inliers: result.motion.inliers, rms: result.motion.rms });
    this.trackingFailures.set(key, 0);
    this.dirtyReferences.add(key);
    void this.persistReference(result.projection, capture);
  }

  private async automaticProjectionFromCompatibleReference(context: PassiveTreeHudContext, capture: PoeWindowCapture): Promise<ProjectionContext | undefined> {
    const scopeKey = targetScope(context);
    if (!scopeKey) return undefined;
    const displays = screen.getAllDisplays();
    const display = capture.displayId
      ? displays.find((candidate) => String(candidate.id) === capture.displayId)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (!display) return undefined;
    const key = calibrationKey(display, scopeKey);
    if (this.calibrations[key]) return this.projectionContext(context, capture.displayId);

    let best: { calibration: StoredCalibration; transform: PassiveTreeTransform; motion: PassiveTreeFrameMotion } | undefined;
    for (const [sourceKey, calibration] of Object.entries(this.calibrations)) {
      const sameScope = calibration.scopeKey ? calibration.scopeKey === scopeKey : sourceKey.endsWith(`:${scopeKey}`);
      if (!sameScope || !calibration.keyframe || !calibration.displayWidth || !calibration.displayHeight) continue;
      if (!captureAspectStable(calibration.captureAspect, capture)) continue;
      const screenMatch = matchPassiveTreeScreenSignature(calibration.screenCheck, capture.bitmap, capture.capture.width, capture.capture.height);
      if (!screenMatch.matched) continue;
      const adapted = adaptPassiveTreeTransformToDisplay({
        transform: { scale: calibration.scale, offsetX: calibration.offsetX, offsetY: calibration.offsetY, ySign: calibration.ySign },
        displayWidth: calibration.displayWidth,
        displayHeight: calibration.displayHeight,
      }, { width: display.bounds.width, height: display.bounds.height });
      if (!adapted) continue;
      const sourceCapture = decodeCapture(calibration.keyframe, display.id);
      if (!sourceCapture || sourceCapture.capture.width !== capture.capture.width || sourceCapture.capture.height !== capture.capture.height) continue;
      const motion = trackPassiveTreeFrameMotion(sourceCapture.bitmap, capture.bitmap, capture.capture.width, capture.capture.height, {
        wide: true,
        searchRadiusPx: 104,
        minimumConfidence: 0.68,
      });
      if (!motion) continue;
      const transform = applyPassiveTreeFrameMotion(adapted, motion, capture.capture, { width: display.bounds.width, height: display.bounds.height });
      if (!best || motion.confidence > best.motion.confidence) best = { calibration, transform, motion };
    }
    if (!best) return undefined;

    const signature = createPassiveTreeScreenSignature(capture.bitmap, capture.capture.width, capture.capture.height);
    if (!signature) return undefined;
    const calibration: StoredCalibration = {
      ...best.transform,
      captureAspect: captureAspect(capture),
      screenCheck: signature,
      keyframe: { width: capture.capture.width, height: capture.capture.height, bitmapBase64: capture.bitmap.toString('base64') },
      references: [],
      displayWidth: display.bounds.width,
      displayHeight: display.bounds.height,
      displayScaleFactor: display.scaleFactor,
      scopeKey,
      updatedAt: new Date().toISOString(),
    };
    this.calibrations[key] = calibration;
    this.liveTransforms.set(key, best.transform);
    this.trustedFrames.set(key, cloneCapture(capture));
    this.diagnostics.set(key, { confidence: best.motion.confidence, inliers: best.motion.inliers, rms: best.motion.rms });
    this.trackingFailures.set(key, 0);
    this.lastReferenceSave.set(key, Date.now());
    await this.saveCalibrations();
    this.options.log?.info(`Passive Target Lock automatically recovered ${scopeKey} on ${display.bounds.width}x${display.bounds.height} from a compatible trusted reference.`);
    return { display, scopeKey, calibrationKey: key, transform: best.transform, calibration };
  }

  private targetVisualIdentity(projection: ProjectionContext, context: PassiveTreeHudContext): string {
    return `${projection.calibrationKey}:${context.guide?.target?.nodeId ?? 0}:${context.guide?.target?.type ?? 'none'}`;
  }

  private ensureTargetVisual(projection: ProjectionContext, context: PassiveTreeHudContext): TargetVisualState {
    const identity = this.targetVisualIdentity(projection, context);
    if (!this.targetVisual || this.targetVisual.identity !== identity) {
      this.targetVisual = { identity, verification: 'learning', stableChangeCount: 0, mismatchCount: 0, pendingOperation: false };
    }
    return this.targetVisual;
  }

  private triggerAutomaticProgress(context: PassiveTreeHudContext, visual: TargetVisualState, confidence: number): void {
    const target = context.guide?.target;
    if (!target || context.guide?.mode !== 'exact' || visual.pendingOperation || !this.options.onTargetOperationDetected) return;
    visual.pendingOperation = true;
    const event: PassiveTargetOperationDetected = { nodeId: target.nodeId, operation: target.type, confidence };
    void Promise.resolve(this.options.onTargetOperationDetected(event)).then((advanced) => {
      if (!advanced && this.targetVisual?.identity === visual.identity) visual.pendingOperation = false;
      this.poke();
    }).catch((error) => {
      if (this.targetVisual?.identity === visual.identity) visual.pendingOperation = false;
      this.options.log?.warn('Passive Target Lock automatic build progression callback failed safely.', error);
      this.poke();
    });
  }

  private inspectTargetVisual(
    context: PassiveTreeHudContext,
    result: TrackingResult,
    capture: PoeWindowCapture,
  ): { verification: TargetVisualState['verification']; autoAdvanceArmed: boolean; mismatch: boolean } {
    const target = context.guide?.target;
    const snapshot = context.snapshot;
    if (!target || !snapshot) return { verification: 'learning', autoAdvanceArmed: false, mismatch: false };
    const point = passiveHudTarget(snapshot, target.nodeId);
    if (!point) return { verification: 'learning', autoAdvanceArmed: false, mismatch: false };
    const projected = projectPassiveTreePoint(result.projection.transform, point);
    const markerRadius = targetMarkerRadius(result.projection.transform, result.projection.display, target.type);
    const edge = edgeIndicatorForTarget(projected, result.projection.display.bounds.width, result.projection.display.bounds.height);
    const visual = this.ensureTargetVisual(result.projection, context);
    if (edge.visible) return { verification: visual.verification, autoAdvanceArmed: false, mismatch: false };

    const cursor = screen.getCursorScreenPoint();
    const localCursor = { x: cursor.x - result.projection.display.bounds.x, y: cursor.y - result.projection.display.bounds.y };
    const cursorNearTarget = Math.hypot(localCursor.x - projected.x, localCursor.y - projected.y) <= Math.max(44, markerRadius * 1.75);
    if (cursorNearTarget || !result.motion.stationary) {
      return { verification: visual.verification, autoAdvanceArmed: false, mismatch: false };
    }

    const patch = samplePassiveTargetPatch(
      capture.bitmap,
      capture.capture,
      { width: result.projection.display.bounds.width, height: result.projection.display.bounds.height },
      { x: projected.x, y: projected.y, radius: markerRadius },
    );
    if (!patch) return { verification: visual.verification, autoAdvanceArmed: false, mismatch: false };
    if (!visual.reference) {
      visual.reference = patch;
      visual.verification = 'learning';
      return { verification: visual.verification, autoAdvanceArmed: true, mismatch: false };
    }

    const comparison = comparePassiveTargetPatches(visual.reference, patch);
    if (!comparison) return { verification: visual.verification, autoAdvanceArmed: false, mismatch: false };
    const operationComplete = passiveTargetOperationLooksComplete(comparison, target.type);
    if (operationComplete) {
      visual.stableChangeCount += 1;
      visual.mismatchCount = 0;
      visual.verification = 'changed';
      if (visual.stableChangeCount >= AUTO_ADVANCE_CONFIRMATIONS) {
        this.triggerAutomaticProgress(context, visual, clamp(1 - comparison.difference * 0.35, 0.7, 0.99));
      }
      return { verification: visual.verification, autoAdvanceArmed: !visual.pendingOperation, mismatch: false };
    }

    visual.stableChangeCount = 0;
    if (passiveTargetPatchIsGrossMismatch(comparison)) {
      visual.mismatchCount += 1;
      visual.verification = visual.mismatchCount >= LOCAL_MISMATCH_CONFIRMATIONS ? 'mismatch' : 'changed';
      return { verification: visual.verification, autoAdvanceArmed: false, mismatch: visual.verification === 'mismatch' };
    }

    visual.mismatchCount = 0;
    visual.verification = comparison.difference <= 0.075 ? 'verified' : 'changed';
    return { verification: visual.verification, autoAdvanceArmed: true, mismatch: false };
  }

  private visibleState(
    context: PassiveTreeHudContext,
    result: TrackingResult,
    capture: PoeWindowCapture,
    visual: { verification: TargetVisualState['verification']; autoAdvanceArmed: boolean },
  ): PassiveTreeHudState {
    const guide = context.guide!;
    const snapshot = context.snapshot!;
    const projection = result.projection;
    const targetPoint = passiveHudTarget(snapshot, guide.target!.nodeId)!;
    const projectedTarget = projectPassiveTreePoint(projection.transform, targetPoint);
    const edge = edgeIndicatorForTarget(projectedTarget, projection.display.bounds.width, projection.display.bounds.height);
    const diagnostics = this.diagnostics.get(projection.calibrationKey);
    const ascendancyName = projection.scopeKey === 'base' ? undefined : passiveAscendancyNameFromScope(projection.scopeKey);
    const markerRadius = targetMarkerRadius(projection.transform, projection.display, guide.target!.type);
    const offscreenDistancePx = edge.visible ? Math.round(Math.hypot(projectedTarget.x - edge.x, projectedTarget.y - edge.y)) : undefined;
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
      message: `Target Lock is glued to PoB node ${guide.target!.nodeId}. Build progression alone controls target identity.`,
      confidence: diagnostics?.confidence ?? result.motion.confidence,
      inliers: diagnostics?.inliers ?? result.motion.inliers,
      rms: diagnostics?.rms ?? result.motion.rms,
      trackingMode: result.mode,
      targetVerification: visual.verification,
      autoAdvanceArmed: visual.autoAdvanceArmed,
      displayId: projection.display.id,
      displayBounds: { ...projection.display.bounds },
      captureSize: { ...capture.capture },
      target: {
        nodeId: guide.target!.nodeId,
        name: guide.target!.nodeName,
        kind: guide.target!.nodeKind,
        x: projectedTarget.x,
        y: projectedTarget.y,
        markerRadius,
        operation: guide.target!.type,
        index: guide.target!.index,
        total: guide.target!.total,
        checkpoint: guide.target!.checkpoint,
        offscreen: edge.visible,
        arrowX: edge.visible ? edge.x : undefined,
        arrowY: edge.visible ? edge.y : undefined,
        arrowAngle: edge.visible ? edge.angle : undefined,
        offscreenDistancePx,
        offscreenDirection: edge.visible ? compassDirection(edge.angle) : undefined,
      },
      path: [],
      lastLockedAt: new Date().toISOString(),
    };
  }

  private async recenterAtCursor(request: RecenterRequest): Promise<void> {
    if (this.stopped) return;
    const context = this.options.context();
    const idle = this.eligibilityState(context);
    if (idle) { this.emit(idle); return; }
    const snapshot = context.snapshot;
    const guide = context.guide;
    const scopeKey = targetScope(context);
    if (!snapshot || !guide?.target || !scopeKey || !hasPassiveTreeGeometry(snapshot)) return;
    const anchor = scopeAnchor(context, scopeKey);
    if (!anchor) {
      this.emit(this.waitingTreeState(context, 'Anchor capture failed closed because the current tree scope has no fixed class/Ascendancy start node.'));
      return;
    }

    const display = screen.getAllDisplays().find((candidate) => candidate.id === request.displayId) ?? screen.getDisplayNearestPoint(request.cursor);
    this.consecutiveTreeMatches = 0;
    this.emit(this.waitingTreeState(context, 'Capturing the emergency Target Lock reference. Keep the passive tree at maximum zoom-out while the reference frames are sampled.'));
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const first = await this.capturePoeWindow();
      if (!captureDisplayMatches(first, display)) {
        this.emit(this.waitingTreeState(context, 'Anchor rejected: Path of Exile is captured from a different display than the cursor position recorded at hotkey press.'));
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
      const localX = request.cursor.x - display.bounds.x;
      const localY = request.cursor.y - display.bounds.y;
      const transform: PassiveTreeTransform = { scale, offsetX: localX - anchor.x * scale, offsetY: localY - anchor.y * scale, ySign: 1 };
      const key = calibrationKey(display, scopeKey);
      const calibration: StoredCalibration = {
        ...transform,
        captureAspect: captureAspect(first),
        screenCheck: signature,
        keyframe: { width: second.capture.width, height: second.capture.height, bitmapBase64: second.bitmap.toString('base64') },
        references: [],
        displayWidth: display.bounds.width,
        displayHeight: display.bounds.height,
        displayScaleFactor: display.scaleFactor,
        scopeKey,
        updatedAt: new Date().toISOString(),
      };
      this.calibrations[key] = calibration;
      this.liveTransforms.set(key, transform);
      this.trustedFrames.set(key, cloneCapture(second));
      this.diagnostics.set(key, { confidence: 1, inliers: 0, rms: 0 });
      this.trackingFailures.set(key, 0);
      this.lastReferenceSave.set(key, Date.now());
      this.dirtyReferences.delete(key);
      this.targetVisual = undefined;
      this.consecutiveTreeMatches = REQUIRED_TREE_MATCHES;
      await this.saveCalibrations();
      this.options.log?.info(`Passive Target Lock reference captured for ${key}; future compatible views recover automatically.`);
      this.poke();
    } catch (error) {
      if (String(error).includes('POE_NOT_RUNNING')) this.emit(this.waitingTreeState(context, 'Target Lock needs Path of Exile running with the passive tree open.'));
      else {
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
    this.targetVisual = undefined;
    this.consecutiveTreeMatches = 0;
    void this.saveCalibrations();
    this.emit(this.waitingTreeState(context, `Target Lock reference cleared. Automatic recovery will be attempted first; ${RECENTER_HOTKEY} remains the emergency manual fallback.`));
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.polling || this.calibrating) return;
    this.polling = true;
    try {
      const context = this.options.context();
      const idle = this.eligibilityState(context);
      if (idle) {
        this.consecutiveTreeMatches = 0;
        this.targetVisual = undefined;
        this.emit(idle);
        return;
      }

      const capture = await this.capturePoeWindow();
      let projection = this.projectionContext(context, capture.displayId);
      if (!projection) projection = await this.automaticProjectionFromCompatibleReference(context, capture);
      if (!projection) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `No trusted reference exists for this first tree/display shape yet. Fully zoom out, hover the ${context.guide?.className ?? 'class/Ascendancy'} start node and press ${RECENTER_HOTKEY} once; later reopen/resolution recovery is automatic.`));
        return;
      }
      if (!captureDisplayMatches(capture, projection.display)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Target Lock is hidden because Path of Exile moved to another display. Automatic compatible-reference recovery will keep trying; ${RECENTER_HOTKEY} is only the fallback.`));
        return;
      }
      if (!captureAspectStable(projection.calibration.captureAspect, capture)) {
        this.consecutiveTreeMatches = 0;
        this.emit(this.waitingTreeState(context, `Target Lock is hidden because the PoE window shape changed materially. Automatic same-aspect recovery is unavailable; use ${RECENTER_HOTKEY} once for this new aspect.`));
        return;
      }

      const match = matchPassiveTreeScreenSignature(projection.calibration.screenCheck, capture.bitmap, capture.capture.width, capture.capture.height);
      if (!match.matched) {
        this.consecutiveTreeMatches = 0;
        const trusted = this.trustedFrames.get(projection.calibrationKey);
        if (trusted && this.dirtyReferences.has(projection.calibrationKey)) void this.persistReference(projection, trusted, true);
        this.emit(this.waitingTreeState(context, 'Path of Exile is running. Waiting for the passive skill tree UI to be visible.'));
        return;
      }

      this.consecutiveTreeMatches += 1;
      if (this.consecutiveTreeMatches < REQUIRED_TREE_MATCHES) {
        this.emit(this.waitingTreeState(context, 'Passive-tree UI found; confirming before showing the target reticle.', 'searching'));
        return;
      }

      const result = this.solveProjection(projection, capture);
      if (!result) {
        const failures = (this.trackingFailures.get(projection.calibrationKey) ?? 0) + 1;
        this.trackingFailures.set(projection.calibrationKey, failures);
        const message = failures >= 3
          ? `Target Lock refused an uncertain camera jump. The reticle is hidden instead of guessing. Trusted keyframes will keep trying automatically; ${RECENTER_HOTKEY} is the emergency fallback.`
          : 'Target Lock lost confidence in passive-tree motion. The reticle is hidden while trusted keyframes try to recover the same tree view.';
        this.emit(this.waitingTreeState(context, message, 'searching'));
        return;
      }

      const visual = this.inspectTargetVisual(context, result, capture);
      if (visual.mismatch) {
        const failures = (this.trackingFailures.get(projection.calibrationKey) ?? 0) + 1;
        this.trackingFailures.set(projection.calibrationKey, failures);
        this.emit(this.waitingTreeState(context, 'The local target watchdog disagreed with the proposed viewport transform. The reticle is hidden and the untrusted transform was not committed.', 'searching'));
        return;
      }

      this.commitTracking(result, capture);
      this.emit(this.visibleState(context, result, capture, visual));
    } catch (error) {
      this.consecutiveTreeMatches = 0;
      if (String(error).includes('POE_NOT_RUNNING')) this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is not running. Passive Target Lock capture is suspended.'));
      else if (String(error).includes('POE_CAPTURE_EMPTY')) this.emit(this.waitingTreeState(this.options.context(), 'Path of Exile is running, but its window capture is unavailable.'));
      else {
        this.options.log?.warn('Passive Target Lock screen check failed.', error);
        this.emit({ status: 'capture-error', enabled: true, visible: false, message: `Passive Target Lock could not inspect the Path of Exile window safely: ${String(error)}`, path: [] });
      }
    } finally {
      this.polling = false;
      if (this.recenterRequest) void this.runQueuedRecenter();
      else this.schedule();
    }
  }
}
