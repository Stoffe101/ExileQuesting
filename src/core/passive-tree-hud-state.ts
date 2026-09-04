import type { PassiveNodeKind } from './passive-data';

export type PassiveTreeHudStatus =
  | 'disabled'
  | 'waiting-build'
  | 'waiting-point'
  | 'waiting-tree'
  | 'missing-geometry'
  | 'unsupported-target'
  | 'searching'
  | 'locked'
  | 'capture-error';

export interface PassiveTreeHudScreenNode {
  nodeId: number;
  name: string;
  kind?: PassiveNodeKind;
  x: number;
  y: number;
  markerRadius: number;
  operation: 'allocate' | 'refund';
  index?: number;
  total?: number;
  checkpoint?: number;
  offscreen: boolean;
  arrowX?: number;
  arrowY?: number;
  arrowAngle?: number;
  /** Approximate screen-space distance from the visible tree viewport. */
  offscreenDistancePx?: number;
  /** Human-readable compass direction for the edge indicator. */
  offscreenDirection?: string;
}

export interface PassiveTreeHudPathPoint {
  nodeId: number;
  name?: string;
  x: number;
  y: number;
  state: 'recent' | 'next' | 'upcoming' | 'stage';
  offscreen?: boolean;
}

export interface PassiveTreeHudOperationDetected {
  nodeId: number;
  operation: 'allocate' | 'refund';
  confidence: number;
  /** Unique token so a renderer can acknowledge exactly once. */
  token: string;
}

export interface PassiveTreeHudState {
  status: PassiveTreeHudStatus;
  enabled: boolean;
  visible: boolean;
  mode?: 'exact' | 'stage';
  sourceLabel?: string;
  className?: string;
  classStartNodeId?: number;
  /** Which independently registered tree is currently visible. */
  treeScope?: 'base' | 'ascendancy';
  /** Friendly GGG scope name when treeScope is ascendancy. */
  ascendancyName?: string;
  message: string;
  confidence?: number;
  inliers?: number;
  rms?: number;
  /** Cheap stationary fast path, feature tracking, or keyframe recovery. */
  trackingMode?: 'stationary' | 'motion' | 'reacquired';
  /** Local continuity watchdog around the exact projected target. */
  targetVerification?: 'learning' | 'verified' | 'changed' | 'mismatch';
  /** True while persistent visual-change detection can safely advance an ordered build. */
  autoAdvanceArmed?: boolean;
  /** One-shot verified visual operation. Build progression remains the only authority that changes target ID. */
  operationDetected?: PassiveTreeHudOperationDetected;
  displayId?: number;
  displayBounds?: { x: number; y: number; width: number; height: number };
  captureSize?: { width: number; height: number };
  target?: PassiveTreeHudScreenNode;
  path: PassiveTreeHudPathPoint[];
  lastLockedAt?: string;
}

export function passiveTreeHudIdle(enabled = true): PassiveTreeHudState {
  return {
    status: enabled ? 'waiting-build' : 'disabled',
    enabled,
    visible: false,
    message: enabled ? 'Waiting for passive guidance from the active build.' : 'Passive Tree HUD is disabled.',
    path: [],
  };
}
