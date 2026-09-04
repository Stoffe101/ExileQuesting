export interface PassiveTreeReplayMotionCase {
  id: string;
  description: string;
  scale: number;
  residualPanX: number;
  residualPanY: number;
  wide?: boolean;
  stationary?: boolean;
}

/**
 * Sanitised motion expectations distilled from the 2026-09-03 real-client
 * ultrawide failure recording. No user video or private frame data is committed;
 * only the camera-motion invariants that future Target Lock changes must keep.
 */
export const PASSIVE_TREE_REAL_CLIENT_REPLAY_CASES: readonly PassiveTreeReplayMotionCase[] = [
  {
    id: 'stationary-8-9',
    description: 'Tree remains pixel-stationary while the old marker used to teleport.',
    scale: 1,
    residualPanX: 0,
    residualPanY: 0,
    stationary: true,
  },
  {
    id: 'stationary-tooltip-49-50',
    description: 'Tooltip interaction must not manufacture passive-tree camera motion.',
    scale: 1,
    residualPanX: 0,
    residualPanY: 0,
    stationary: true,
  },
  {
    id: 'wheel-burst-61.4-61.6',
    description: 'Aggressive centre zoom with a small real pan component.',
    scale: 1.623,
    residualPanX: -14,
    residualPanY: -2,
  },
  {
    id: 'wheel-burst-61.8-62.0',
    description: 'Second rapid wheel step must remain the same canvas, not a new node constellation.',
    scale: 1.382,
    residualPanX: -9,
    residualPanY: -1,
  },
  {
    id: 'wheel-burst-62.0-62.2',
    description: 'Follow-up 1.55x wheel step that previously failed closed before hardening.',
    scale: 1.553,
    residualPanX: -13,
    residualPanY: -1,
  },
  {
    id: 'one-second-extreme-61-62',
    description: 'Extreme accumulated zoom used to verify wide keyframe recovery.',
    scale: 2.253,
    residualPanX: -30,
    residualPanY: 2,
    wide: true,
  },
] as const;

export const PASSIVE_TREE_REPLAY_DISPLAY_MATRIX = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '3440x1440 ultrawide', width: 3440, height: 1440 },
  { label: '4K', width: 3840, height: 2160 },
] as const;
