import type { RuntimeState } from '../core/types';

function shortKind(kind?: string): string {
  if (!kind) return 'PASSIVE';
  if (kind === 'class-start') return 'CLASS START';
  return kind.toUpperCase();
}

export default function PassiveTreeHudOverlay({ state }: { state: RuntimeState }) {
  const hud = state.passiveTreeHud;
  // Fail closed. The overlay never paints target/path geometry until the service
  // has both a saved calibration and a positive passive-tree UI match.
  if (!hud.visible || hud.status !== 'locked' || (hud.confidence ?? 0) < 0.99) {
    return <main className="passive-tree-hud-root" aria-hidden="true" />;
  }
  const target = hud.target;
  const exact = Boolean(target);
  const scopeLabel = hud.ascendancyName ? `${hud.ascendancyName} Ascendancy` : `${hud.className ?? 'Passive'} tree`;

  return (
    <main className={`passive-tree-hud-root ${state.settings.reducedMotion ? 'reduced-motion' : ''}`} aria-label="Passive Tree HUD">
      <svg className="passive-tree-path-layer" width="100%" height="100%" aria-hidden="true">
        {hud.path.map((point, index) => {
          const next = hud.path[index + 1];
          if (!next || point.offscreen || next.offscreen) return null;
          return <line key={`line-${point.nodeId}-${next.nodeId}-${index}`} x1={point.x} y1={point.y} x2={next.x} y2={next.y} className={`passive-path-line state-${point.state}`} />;
        })}
      </svg>

      {hud.path.map((point, index) => {
        if (point.offscreen) return null;
        return (
          <div
            key={`${point.nodeId}-${index}`}
            className={`passive-path-node state-${point.state}`}
            style={{ left: point.x, top: point.y }}
            title={point.name}
          >
            <i />
          </div>
        );
      })}

      {target && !target.offscreen && (
        <div className={`passive-target operation-${target.operation}`} style={{ left: target.x, top: target.y, '--marker-radius': `${target.markerRadius}px` } as React.CSSProperties}>
          <div className="passive-target-ring"><i /><i /><b>✦</b></div>
          <div className="passive-target-label">
            <em className="passive-scope-label">{scopeLabel}</em>
            <span>{target.operation === 'refund' ? 'REFUND PASSIVE' : 'NEXT PASSIVE'}</span>
            <strong>{target.name}</strong>
            <small>{shortKind(target.kind)}{target.total ? ` · ${target.index}/${target.total}` : ''}</small>
          </div>
        </div>
      )}

      {target?.offscreen && target.arrowX !== undefined && target.arrowY !== undefined && (
        <div className="passive-edge-target" style={{ left: target.arrowX, top: target.arrowY }}>
          <i className="passive-edge-arrow" style={{ transform: `rotate(${target.arrowAngle ?? 0}rad)` }}>➜</i>
          <div><span>{target.operation === 'refund' ? 'REFUND' : 'NEXT PASSIVE'}</span><strong>{target.name}</strong></div>
        </div>
      )}

      {!exact && hud.path.some((point) => point.state === 'stage') && (
        <div className="passive-stage-legend">
          <em className="passive-scope-label">{scopeLabel}</em>
          <span>POB STAGE PASSIVES</span>
          <strong>{hud.path.filter((point) => point.state === 'stage').length} highlighted</strong>
          <small>PoB supplies the stage set, not a source-authored click order.</small>
        </div>
      )}
    </main>
  );
}
