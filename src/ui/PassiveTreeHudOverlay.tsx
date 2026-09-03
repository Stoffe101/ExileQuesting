import type { RuntimeState } from '../core/types';

function shortKind(kind?: string): string {
  if (!kind) return 'PASSIVE';
  if (kind === 'class-start') return 'CLASS START';
  return kind.toUpperCase();
}

export default function PassiveTreeHudOverlay({ state }: { state: RuntimeState }) {
  const hud = state.passiveTreeHud;
  if (!hud.visible || hud.status !== 'locked' || !hud.target) {
    return <main className="passive-tree-hud-root" aria-hidden="true" />;
  }

  const target = hud.target;
  const scopeLabel = hud.ascendancyName ? `${hud.ascendancyName} Ascendancy` : `${hud.className ?? 'Passive'} tree`;

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
          </div>
        </div>
      )}

      {target.offscreen && target.arrowX !== undefined && target.arrowY !== undefined && (
        <div className="passive-edge-target" style={{ left: target.arrowX, top: target.arrowY }}>
          <i className="passive-edge-arrow" style={{ transform: `rotate(${target.arrowAngle ?? 0}rad)` }}>➜</i>
          <div>
            <span>{target.operation === 'refund' ? 'REFUND TARGET' : 'NEXT NODE'}</span>
            <strong>{target.name}</strong>
            <small>Node {target.nodeId}</small>
          </div>
        </div>
      )}
    </main>
  );
}
