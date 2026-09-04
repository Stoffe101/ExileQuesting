import { useState } from 'react';
import { passivePlanSummary } from '../core/guide-experience';
import type { RuntimeState } from '../core/types';
import './passive-plan-modal.css';

export default function PassivePlanModal({ state, onClose }: { state: RuntimeState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const coach = state.buildCoach;
  const plan = passivePlanSummary(coach);
  const maxroll = coach?.maxroll;
  const milestone = coach?.nextPassive;

  const stepExact = async (delta: number) => {
    if (!coach || busy) return;
    setBusy(true);
    try { await window.exileQuesting.stepBuildPassive(coach.profileId, delta); }
    finally { setBusy(false); }
  };

  return (
    <div className="passive-plan-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="passive-plan-modal">
        <header>
          <div><span>PASSIVE PLAN</span><h2>{plan.title}</h2><p>{plan.detail}</p></div>
          <button className="passive-plan-close" onClick={onClose} aria-label="Close Passive Plan">×</button>
        </header>

        {!coach && <div className="passive-plan-empty"><b>Import a Maxroll or Path of Building profile first.</b><p>Passive Plan only shows guidance authored by the active build source. It does not inspect, recognize or draw over the in-game passive tree.</p></div>}

        {coach && <>
          <div className="passive-plan-source"><span>ACTIVE BUILD</span><strong>{coach.profileName}</strong><small>{coach.sourceKind} · {coach.stageTitle ?? 'active leveling stage'}</small></div>

          {maxroll && <section className="passive-plan-exact">
            <div className="passive-plan-section-title"><span>ORDERED MAXROLL PLAN</span><em>{maxroll.mode === 'twink' ? 'Twink' : 'League start'} · {maxroll.compatibility}</em></div>
            <div className="passive-plan-progress"><i style={{ width: `${Math.round((maxroll.passiveCompleted / Math.max(1, maxroll.passiveTotal)) * 100)}%` }} /></div>
            <div className="passive-plan-progress-label"><span>{maxroll.passiveCompleted} complete</span><span>{maxroll.passiveTotal} total operations</span></div>
            {maxroll.nextPassive ? <article className={`passive-next passive-${maxroll.nextPassive.type}`}>
              <b>{maxroll.nextPassive.type === 'refund' ? 'REFUND' : 'TAKE'}</b>
              <div><h3>{maxroll.nextPassive.nodeName}</h3><p>{maxroll.nextPassive.nodeKind ?? 'passive'} · checkpoint {maxroll.nextPassive.checkpoint} · node {maxroll.nextPassive.nodeId}</p></div>
              <button className="primary-button" disabled={busy} onClick={() => void stepExact(1)}>{maxroll.nextPassive.type === 'refund' ? 'Refunded ✓' : 'Taken ✓'}</button>
            </article> : <article className="passive-next passive-complete"><b>✓</b><div><h3>Ordered passive path complete</h3><p>All {maxroll.passiveTotal} Maxroll passive operations have been acknowledged.</p></div></article>}
            <div className="passive-plan-controls"><button className="ghost-button" disabled={busy || maxroll.passiveCompleted <= 0} onClick={() => void stepExact(-1)}>Undo previous acknowledgement</button><small>These buttons advance ExileQuesting's build-plan cursor only. They never click the game tree.</small></div>
            <p className="passive-plan-evidence">{maxroll.compatibilityMessage}</p>
          </section>}

          {!maxroll && <section className="passive-plan-stage">
            <div className="passive-plan-section-title"><span>PATH OF BUILDING MILESTONE</span><em>{coach.stageConfidence ?? 'unknown'} alignment</em></div>
            {milestone ? <>
              <h3>{milestone.toTitle}</h3>
              <p>Allocate {milestone.totalAllocations} passive node{milestone.totalAllocations === 1 ? '' : 's'} before the next build stage{milestone.masteryCount ? `, including ${milestone.masteryCount} mastery selection${milestone.masteryCount === 1 ? '' : 's'}` : ''}.</p>
              {milestone.namedTargets.length > 0 && <div className="passive-target-grid">{milestone.namedTargets.map((target) => <article key={target.id}><span>{target.kind.toUpperCase()}</span><strong>{target.name}</strong><small>Node {target.id}</small></article>)}</div>}
              {milestone.unnamedAllocations > 0 && <div className="passive-plan-caution"><b>+ {milestone.unnamedAllocations} pathing allocation{milestone.unnamedAllocations === 1 ? '' : 's'}</b><span>PoB defines the stage difference, but ExileQuesting does not invent a click order through those nodes.</span></div>}
              <div className="passive-plan-caution"><b>{milestone.namesVerified ? 'Node names match bundled passive data' : 'Node-name compatibility not verified'}</b><span>Stage confidence: {milestone.confidence}. Allocation counts remain source-derived.</span></div>
            </> : <div className="passive-plan-empty"><b>No next PoB passive milestone is available.</b><p>The active PoB stage does not expose enough trustworthy tree-difference information for additional guidance.</p></div>}
          </section>}

          <footer><span>No OCR · no screen capture · no memory reading · no automated clicks</span><button className="ghost-button" onClick={onClose}>Close</button></footer>
        </>}
      </section>
    </div>
  );
}
