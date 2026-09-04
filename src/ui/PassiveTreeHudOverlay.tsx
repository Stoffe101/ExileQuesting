import { useEffect, useRef } from 'react';
import type { RuntimeState } from '../core/types';

function shortKind(kind?: string): string {
  if (!kind) return 'PASSIVE';
  if (kind === 'class-start') return 'CLASS START';
  return kind.toUpperCase();
}

export default function PassiveTreeHudOverlay({ state }: { state: RuntimeState }) {
  const hud = state.passiveTreeHud;
  const handledOperationToken = useRef<string>();

  useEffect(() => {
    const detected = hud.operationDetected;
    const profileId = state.buildCoach?.profileId;
    const target = hud.target;
    if (!detected || !profileId || hud.mode !== 'exact' || !target) return;
    if (detected.nodeId !== target.nodeId || detected.operation !== target.operation) return;
    if (handledOperationToken.current === detected.token) return;

    // This calls the same persisted planner path as the manual Next Passive
    // control. Vision never supplies a new node ID; it only acknowledges that
    // the already-authoritative current operation visibly completed.
    handledOperationToken.current = detected.token;
    let cancelled = false;
    let retryTimer: number | undefined;
    const advance = async (attempt: number): Promise<void> => {
      try {
        await window.exileQuesting.stepBuildPassive(profileId, 1);
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          retryTimer = window.setTimeout(() => { void advance(attempt + 1); }, 180 + attempt * 220);
          return;
        }
        // Let a future state delivery retry this exact token instead of
        // permanently swallowing a verified operation after a transient IPC
        // failure. No second cursor step is issued after a successful call.
        if (handledOperationToken.current === detected.token) handledOperationToken.current = undefined;
      }
    };
    void advance(0);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [hud.operationDetected, hud.mode, hud.target, state.buildCoach?.profileId]);

  if (!hud.visible || hud.status !== 'locked' || !hud.target) {
    return <main className="passive-tree-hud-root" aria-hidden="true" />;
  }

  const target = hud.target;
  const scopeLabel = hud.ascendancyName ? `${hud.ascendancyName} Ascendancy` : `${hud.className ?? 'Passive'} tree`;
  const autoLabel = hud.operationDetected
    ? 'ADVANCING'
    : hud.autoAdvanceArmed
      ? 'AUTO FOLLOW READY'
      : hud.targetVerification === 'learning'
        ? 'LEARNING TARGET'
        : undefined;

  return (
    <main className={`passive-tree-hud-root ${state.settings.reducedMotion ? 'reduced-motion' : ''}`} aria-label="Passive Target Lock">
      {!target.offscreen && (
        <div
          className={`passive-target operation-${target.operation}`}
          style={{ left: target.x, top: target.y, '--marker-radius': `${target.markerRadius}px` } as React.CSSProperties}
        >
          <div className="passive-target-crosshair" aria-hidden="true">
            <span className="passive-target-ring" />
            <i className="passive-reticle-tick tick-top" />
            <i className="passive-reticle-tick tick-right" />
            <i className="passive-reticle-tick tick-bottom" />
            <i className="passive-reticle-tick tick-left" />
            <b className="passive-target-core" />
          </div>
          <div className="passive-target-label">
            <em className="passive-scope-label">{scopeLabel}</em>
            <span>{target.operation === 'refund' ? 'REFUND THIS NODE' : 'TAKE THIS NODE'}</span>
            <strong>{target.name}</strong>
            <small>
              NODE {target.nodeId} · {shortKind(target.kind)}
              {target.total ? ` · ${target.index}/${target.total}` : ''}
            </small>
            {autoLabel && <small className="passive-auto-status">{autoLabel}</small>}
          </div>
        </div>
      )}

      {target.offscreen && target.arrowX !== undefined && target.arrowY !== undefined && (
        <div className="passive-edge-target" style={{ left: target.arrowX, top: target.arrowY }}>
          <i className="passive-edge-arrow" style={{ transform: `rotate(${target.arrowAngle ?? 0}rad)` }}>➜</i>
          <div>
            <span>{target.operation === 'refund' ? 'REFUND TARGET' : 'NEXT NODE'}</span>
            <strong>{target.name}</strong>
            <small>
              Node {target.nodeId}
              {target.offscreenDirection ? ` · ${target.offscreenDirection}` : ''}
              {target.offscreenDistancePx !== undefined ? ` · ~${target.offscreenDistancePx}px` : ''}
            </small>
          </div>
        </div>
      )}
    </main>
  );
}
