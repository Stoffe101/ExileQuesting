import { summarizeActions } from '../core/actions';
import { isStepEnabled } from '../core/campaign';
import { focusHint, layoutAuditStatus } from '../core/layouts';
import type { RouteAction, RuntimeState } from '../core/types';
import './zone-diagram-modal.css';

const ICONS: Partial<Record<RouteAction['type'], string>> = {
  travel: '→', kill: '⚔', talk: '●', collect: '◆', reward: '◇', waypoint: '◈', passive: '+1', trial: '△',
  vendor: '¤', gem: '✦', portal: '○', relog: '↩', craft: '⌁', build: '⬡', warning: '!', context: '·',
};

function activeIndex(state: RuntimeState): number {
  for (let index = state.progress; index < state.dataset.steps.length; index += 1) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
  }
  return Math.max(0, Math.min(state.progress, state.dataset.steps.length - 1));
}

export default function ZoneDiagramModal({ state, onClose }: { state: RuntimeState; onClose: () => void }) {
  const index = activeIndex(state);
  const step = state.dataset.steps[index];
  const summary = summarizeActions(step.actions);
  const decisive = [summary.now, ...summary.then].filter((action): action is RouteAction => Boolean(action)).slice(0, 7);
  const hint = focusHint(step.layoutHints ?? []);
  const audit = hint ? layoutAuditStatus(hint) : undefined;
  const layoutKind = hint ? (/hub|branch/i.test(hint.text) ? 'hub' : /opposite|other side|away from/i.test(hint.text) ? 'opposite' : /wall|edge|shore|stream|road/i.test(hint.text) ? 'edge' : /stair|rotation|alternate/i.test(hint.text) ? 'zigzag' : 'route') : 'flow';

  return (
    <div className="zone-diagram-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="zone-diagram-modal">
        <header><div><span>ZONE DIAGRAM</span><h2>{step.targetArea ?? state.currentZone ?? `Act ${step.act}`}</h2><p>{hint ? 'Maintained layout clue plus the current objective flow.' : 'Objective-flow diagram. No trustworthy spatial layout is currently maintained for this zone.'}</p></div><button onClick={onClose} aria-label="Close zone diagram">×</button></header>

        <div className={`zone-diagram-canvas diagram-${layoutKind}`}>
          <div className="zone-diagram-spine" />
          {decisive.map((action, position) => <article key={`${action.id}:${position}`} className={`${position === 0 ? 'now' : ''} diagram-action-${action.type}`}>
            <i>{ICONS[action.type] ?? '·'}</i>
            <div><span>{position === 0 ? 'NOW' : `THEN ${position}`}</span><strong>{action.title}</strong>{action.detail && <small>{action.detail}</small>}</div>
          </article>)}
          {!decisive.length && <article className="now"><i>?</i><div><span>NOW</span><strong>{step.title}</strong></div></article>}
        </div>

        {hint ? <section className={`zone-diagram-layout audit-${audit}`}><div><span>LAYOUT CLUE · {audit?.toUpperCase()} · {hint.confidence.toUpperCase()}</span><strong>{hint.text}</strong></div><p>{hint.auditNote ?? `${hint.gameVersion ?? 'Patch not recorded'} · ${hint.source ?? 'ExileQuesting maintained knowledge'}`}</p></section> : <section className="zone-diagram-layout no-layout"><div><span>SPATIAL DATA</span><strong>No audited layout clue for this zone yet.</strong></div><p>ExileQuesting shows the verified objective sequence instead of inventing a route through a procedurally generated layout.</p></section>}

        <footer><span>Diagram ≠ exact generated map</span><button className="ghost-button" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}
