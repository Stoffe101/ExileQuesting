import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import type { PassiveTreeGuidePlan } from '../../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudState } from '../../src/core/passive-tree-hud-state';

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

export interface PassiveTreeHudServiceOptions {
  context: () => PassiveTreeHudContext;
  onState: (state: PassiveTreeHudState) => void;
  log?: PassiveTreeHudLogger;
  captureWidth?: number;
  gateCaptureWidth?: number;
  searchIntervalMs?: number;
  lockedIntervalMs?: number;
}

/**
 * Retired runtime shim.
 *
 * Campaign Guide 2 replaces the passive-tree screen overlay with an in-app Passive Plan.
 * Keeping this tiny compatibility class for one migration cycle lets older persisted settings,
 * RuntimeState consumers and release fixtures deserialize safely without ever starting desktop
 * capture, passive-tree vision, point-cloud registration, tracking timers or game-window polling.
 *
 * Delete the remaining compatibility state once the persisted-settings migration no longer needs
 * to understand v0.2.x Passive Tree HUD fields.
 */
export class PassiveTreeHudService {
  private readonly state: PassiveTreeHudState = {
    ...passiveTreeHudIdle(false),
    status: 'disabled',
    visible: false,
    message: 'Passive Tree HUD retired. Use Campaign Guide 2 → Passive Plan for build-source passive guidance.',
  };
  private started = false;

  constructor(private readonly options: PassiveTreeHudServiceOptions) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.options.log?.info('Passive Tree HUD runtime is retired; desktop capture is not started.');
    this.options.onState(this.state);
  }

  stop(): void {
    this.started = false;
  }

  poke(): void {
    if (this.started) this.options.onState(this.state);
  }

  snapshot(): PassiveTreeHudState {
    return this.state;
  }
}
