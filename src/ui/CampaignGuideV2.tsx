import { useEffect, useMemo, useState } from 'react';
import { isStepEnabled } from '../core/campaign';
import { summarizeActions } from '../core/actions';
import { focusHint } from '../core/layouts';
import {
  campaignCompletionAudit,
  guideCalloutsForStep,
  guideRecoveryContext,
  passivePlanSummary,
  progressionTimeline,
  type GuideCallout,
} from '../core/guide-experience';
import type { CampaignStep, RewardAuditItem, RouteAction, RuntimeState } from '../core/types';
import { copyText } from './clipboard';
import './campaign-guide-v2.css';

type GuideView = 'route' | 'map' | 'timeline' | 'audit';
type RouteFilter = 'all' | 'critical' | 'passives' | 'trials' | 'labyrinth' | 'build';

const ACTION_ICONS: Partial<Record<RouteAction['type'], string>> = {
  travel: '→', kill: '⚔', talk: '●', collect: '◆', reward: '◇', waypoint: '◈', passive: '+', trial: '△',
  vendor: '¤', gem: '✦', portal: '○', relog: '↩', craft: '⌁', build: '⬡', warning: '!', context: '·',
};

const CALLOUT_ICONS: Record<GuideCallout['kind'], string> = {
  passive: '+1', trial: '△', labyrinth: '♜', waypoint: '◈', build: '⬡', craft: '⌁', warning: '!',
};

function enabledIndices(state: RuntimeState): number[] {
  return state.dataset.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => isStepEnabled(step, state.settings))
    .map(({ index }) => index);
}

function nearestEnabledIndex(state: RuntimeState, from = state.progress): number {
  let index = from;
  while (index < state.dataset.steps.length) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
    index += 1;
  }
  return Math.max(0, Math.min(from, state.dataset.steps.length - 1));
}

function rewardFor(state: RuntimeState, step: CampaignStep): RewardAuditItem | undefined {
  return state.rewardAudit.items.find((item) => item.stepId === step.id);
}

function importanceFor(step: CampaignStep): 'critical' | 'milestone' | 'normal' | 'optional' {
  const callouts = guideCalloutsForStep(step);
  if (callouts.some((callout) => callout.importance === 'critical')) return 'critical';
  if (callouts.some((callout) => callout.importance === 'milestone')) return 'milestone';
  if (step.tags.includes('optional')) return 'optional';
  return 'normal';
}

function matchesFilter(step: CampaignStep, filter: RouteFilter): boolean {
  if (filter === 'all') return true;
  const callouts = guideCalloutsForStep(step);
  if (filter === 'critical') return callouts.some((callout) => callout.importance === 'critical');
  if (filter === 'passives') return callouts.some((callout) => callout.kind === 'passive');
  if (filter === 'trials') return callouts.some((callout) => callout.kind === 'trial');
  if (filter === 'labyrinth') return callouts.some((callout) => callout.kind === 'labyrinth');
  return callouts.some((callout) => callout.kind === 'build');
}

function ActionLine({ action }: { action: RouteAction }) {
  return (
    <div className={`g2-action action-${action.type} ${action.critical ? 'critical' : ''}`}>
      <span>{ACTION_ICONS[action.type] ?? '·'}</span>
      <div><strong>{action.title}</strong>{action.detail && <small>{action.detail}</small>}</div>
    </div>
  );
}

function Callout({ callout }: { callout: GuideCallout }) {
  return (
    <div className={`g2-callout importance-${callout.importance} callout-${callout.kind}`}>
      <b>{CALLOUT_ICONS[callout.kind]}</b>
      <div><span>{callout.kind === 'labyrinth' ? 'LABYRINTH' : callout.kind.toUpperCase()}</span><strong>{callout.title}</strong>{callout.detail && <p>{callout.detail}</p>}</div>
    </div>
  );
}

function LayoutSketch({ step }: { step: CampaignStep }) {
  const hint = focusHint(step.layoutHints ?? []);
  if (!hint) return null;
  const text = hint.text.toLowerCase();
  const kind = /hub|branch/.test(text) ? 'hub'
    : /opposite|away from|other side/.test(text) ? 'opposite'
      : /alternate|rotation|stair/.test(text) ? 'zigzag'
        : /wall|edge|shore|stream|road/.test(text) ? 'edge'
          : 'route';
  return (
    <section className="g2-layout-sketch">
      <div className={`g2-sketch sketch-${kind}`} aria-hidden="true">
        <i className="start">START</i><i className="path-one" /><i className="path-two" /><i className="goal">GOAL</i><i className="branch" />
      </div>
      <div><span>LAYOUT CLUE · {hint.confidence.toUpperCase()}</span><strong>Route sketch, not an exact map</strong><p>{hint.text}</p></div>
    </section>
  );
}

function PassivePlan({ state }: { state: RuntimeState }) {
  const plan = passivePlanSummary(state.buildCoach);
  return (
    <section className={`g2-passive-plan state-${plan.state}`}>
      <div className="g2-panel-label"><span>PASSIVE PLAN</span><em>No in-game tree overlay</em></div>
      <strong>{plan.title}</strong>
      <p>{plan.detail}</p>
      {plan.total !== undefined && <div className="g2-passive-progress"><i style={{ width: `${Math.round(((plan.completed ?? 0) / Math.max(1, plan.total)) * 100)}%` }} /></div>}
      {plan.nodeId !== undefined && <small>Node ID {plan.nodeId} · source-authoritative order</small>}
    </section>
  );
}

function BuildToolkit({ state, step }: { state: RuntimeState; step: CampaignStep }) {
  const coach = state.buildCoach;
  const relevant = step.actions.some((action) => ['build', 'vendor', 'gem', 'craft'].includes(action.type));
  if (!coach || !relevant) return null;
  const equipment = coach.vendorSearch.equipment;
  const gems = coach.vendorSearch.gems;
  return (
    <section className="g2-toolkit">
      <div className="g2-panel-label"><span>BUILD AT THIS STEP</span><em>{coach.stageTitle ?? coach.profileName}</em></div>
      {coach.currentGemTasks.length > 0 && <div className="g2-tool-list"><b>Gems</b>{coach.currentGemTasks.slice(0, 5).map((task) => <span key={`${task.name}:${task.source}`}>{task.copies > 1 ? `${task.copies}× ` : ''}{task.name}<small>{task.source ?? 'source unresolved'}</small></span>)}</div>}
      {coach.craftingHints.length > 0 && <div className="g2-tool-list"><b>Craft now / soon</b>{coach.craftingHints.slice(0, 3).map((hint) => <span key={hint}>{hint}</span>)}</div>}
      {(equipment || gems) && <div className="g2-search-grid">
        {equipment && <button onClick={() => void copyText(equipment.query)}><span>COPY GEAR SEARCH</span><code>{equipment.query}</code><small>{equipment.note}</small></button>}
        {gems && <button onClick={() => void copyText(gems.query)}><span>COPY GEM SEARCH</span><code>{gems.query}</code><small>{gems.note}</small></button>}
      </div>}
    </section>
  );
}

function LostPanel({ state, currentIndex, onInspect, onClose }: { state: RuntimeState; currentIndex: number; onInspect: (index: number) => void; onClose: () => void }) {
  const current = state.dataset.steps[currentIndex];
  const recovery = guideRecoveryContext(state.dataset, currentIndex, state.currentAreaId);
  const previous = state.dataset.steps.slice(0, currentIndex).map((step, index) => ({ step, index })).reverse().find(({ step }) => isStepEnabled(step, state.settings));
  const next = state.dataset.steps.slice(currentIndex + 1).map((step, offset) => ({ step, index: currentIndex + 1 + offset })).find(({ step }) => isStepEnabled(step, state.settings));
  const hint = focusHint((recovery.matchedStep ?? current).layoutHints ?? []);
  const unresolved = state.rewardAudit.items.filter((item) => item.status === 'route-passed').slice(0, 4);
  return (
    <div className="g2-lost-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="g2-lost-panel">
        <header><div><span>I'M LOST</span><h2>{recovery.title}</h2><p>{recovery.detail}</p></div><button onClick={onClose}>×</button></header>
        <div className="g2-lost-grid">
          <article><span>YOU ARE</span><strong>{state.currentZone ?? recovery.matchedStep?.targetArea ?? 'Zone not detected'}</strong><small>{state.currentAreaId ?? 'Waiting for Client.txt'}</small></article>
          <article><span>YOUR GOAL</span><strong>{summarizeActions(current.actions).now?.title ?? current.title}</strong><small>{current.targetArea ?? `Act ${current.act}`}</small></article>
          <article><span>LOOK FOR</span><strong>{hint?.text ?? current.annotation?.summary ?? 'Follow the current route objective and zone transitions.'}</strong><small>{hint ? `${hint.confidence} confidence layout clue` : 'Objective context'}</small></article>
          <article><span>AFTERWARDS</span><strong>{next ? summarizeActions(next.step.actions).now?.title ?? next.step.title : 'Campaign complete'}</strong><small>{next?.step.targetArea ?? 'Review completion audit'}</small></article>
        </div>
        {unresolved.length > 0 && <div className="g2-catchup"><b>UNCONFIRMED PERMANENT REWARDS</b>{unresolved.map((item) => <button key={item.stepId} onClick={() => { onInspect(item.stepIndex); onClose(); }}>Act {item.act} · {item.label}<span>{item.type === 'passive' ? '+1 PASSIVE' : 'TRIAL'}</span></button>)}</div>}
        <footer>{previous && <button className="ghost-button" onClick={() => { onInspect(previous.index); onClose(); }}>Previous objective</button>}<button className="primary-button" onClick={() => { onInspect(currentIndex); onClose(); }}>Show current route</button></footer>
      </section>
    </div>
  );
}

function ActMap({ state, act, currentIndex, onInspect }: { state: RuntimeState; act: number; currentIndex: number; onInspect: (index: number) => void }) {
  const indices = enabledIndices(state).filter((index) => state.dataset.steps[index].act === act);
  const significant = indices.filter((index, position) => position === 0 || position === indices.length - 1 || importanceFor(state.dataset.steps[index]) !== 'normal');
  return (
    <div className="g2-act-map">
      <div className="g2-map-spine" />
      {significant.map((index) => {
        const step = state.dataset.steps[index];
        const callouts = guideCalloutsForStep(step);
        const badge = callouts.find((callout) => ['passive', 'trial', 'labyrinth', 'build'].includes(callout.kind));
        return <button key={step.id} className={`${index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''} map-${importanceFor(step)}`} onClick={() => onInspect(index)}><i>{index < currentIndex ? '✓' : index === currentIndex ? '●' : '○'}</i><div><small>{step.targetArea ?? `Act ${act}`}</small><strong>{summarizeActions(step.actions).now?.title ?? step.title}</strong></div>{badge && <em>{CALLOUT_ICONS[badge.kind]} {badge.kind === 'passive' ? 'PASSIVE' : badge.kind.toUpperCase()}</em>}</button>;
      })}
    </div>
  );
}

function Timeline({ state, currentIndex, onInspect }: { state: RuntimeState; currentIndex: number; onInspect: (index: number) => void }) {
  const items = progressionTimeline(state.dataset, currentIndex);
  return <div className="g2-timeline">{items.map((item) => <button key={item.id} className={`${item.complete ? 'done' : ''} ${item.current ? 'current' : ''} timeline-${item.kind}`} onClick={() => onInspect(item.stepIndex)}><i>{item.complete ? '✓' : item.current ? '●' : '○'}</i><div><span>ACT {item.act} · {item.kind.toUpperCase()}</span><strong>{item.title}</strong></div></button>)}</div>;
}

function CompletionAudit({ state }: { state: RuntimeState }) {
  const audit = campaignCompletionAudit(state.rewardAudit, state.buildCoach);
  return (
    <div className={`g2-completion audit-${audit.state}`}>
      <header><span>CAMPAIGN COMPLETION AUDIT</span><h2>{audit.headline}</h2><p>This is evidence-backed. Unknown build state stays unknown instead of being guessed.</p></header>
      <div>{audit.checks.map((check) => <article key={check.id} className={`check-${check.state}`}><i>{check.state === 'complete' ? '✓' : check.state === 'attention' ? '!' : '?'}</i><div><strong>{check.label}</strong><small>{check.detail}</small></div></article>)}</div>
      {state.rewardAudit.needsFinalPassivesAudit && <div className="g2-audit-alert"><b>/passives recommended</b><span>Use Path of Exile's /passives command and reconcile any missing quest rewards before maps.</span></div>}
    </div>
  );
}

export default function CampaignGuideV2({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const currentIndex = nearestEnabledIndex(state);
  const current = state.dataset.steps[currentIndex];
  const [selectedAct, setSelectedAct] = useState(current.act);
  const [inspectedIndex, setInspectedIndex] = useState(currentIndex);
  const [filter, setFilter] = useState<RouteFilter>('all');
  const [view, setView] = useState<GuideView>('route');
  const [lost, setLost] = useState(false);

  useEffect(() => {
    setSelectedAct(current.act);
    setInspectedIndex(currentIndex);
  }, [current.id, current.act, currentIndex]);

  const visible = useMemo(() => enabledIndices(state)
    .filter((index) => state.dataset.steps[index].act === selectedAct)
    .filter((index) => matchesFilter(state.dataset.steps[index], filter)), [state, selectedAct, filter]);
  const inspected = state.dataset.steps[inspectedIndex] ?? current;
  const summary = summarizeActions(inspected.actions);
  const callouts = guideCalloutsForStep(inspected);
  const reward = rewardFor(state, inspected);
  const recovery = guideRecoveryContext(state.dataset, currentIndex, state.currentAreaId);

  const inspect = (index: number) => {
    const step = state.dataset.steps[index];
    setSelectedAct(step.act);
    setInspectedIndex(index);
    setView('route');
  };

  return (
    <div className="page g2-page custom-scrollbar">
      <div className="g2-heading">
        <div><span className="eyebrow">CAMPAIGN GUIDE 2.0</span><h1>{state.currentZone ?? `Act ${current.act}`}</h1><p>One route, build-aware milestones, permanent rewards, layout help and recovery when you go off-script.</p></div>
        <div className="g2-heading-actions"><button className="lost-button" onClick={() => setLost(true)}> ? I'M LOST</button><button className="primary-button" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button></div>
      </div>

      {recovery.state !== 'on-route' && <div className={`g2-recovery recovery-${recovery.state}`}><b>{recovery.state === 'revisiting' ? '↩ REVISITING' : recovery.state === 'catching-up' ? '↗ CATCHING UP' : '? ROUTE CHECK'}</b><div><strong>{recovery.title}</strong><span>{recovery.detail}</span></div>{recovery.matchedStepIndex !== undefined && <button onClick={() => inspect(recovery.matchedStepIndex!)}>Show this zone</button>}</div>}

      <div className="g2-command-strip"><span><kbd>Ctrl</kbd><kbd>K</kbd> Search anywhere</span><span>Critical instructions are never hidden by detail mode.</span><PassivePlan state={state} /></div>

      <nav className="g2-view-tabs">
        {([['route', 'Route'], ['map', 'Act map'], ['timeline', 'Timeline'], ['audit', 'Completion audit']] as Array<[GuideView, string]>).map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>)}
      </nav>

      {view === 'map' && <><div className="act-tabs custom-scrollbar">{Array.from({ length: 10 }, (_, index) => index + 1).map((act) => <button className={act === selectedAct ? 'active' : ''} onClick={() => setSelectedAct(act)} key={act}><span>ACT</span>{act}</button>)}</div><ActMap state={state} act={selectedAct} currentIndex={currentIndex} onInspect={inspect} /></>}
      {view === 'timeline' && <Timeline state={state} currentIndex={currentIndex} onInspect={inspect} />}
      {view === 'audit' && <CompletionAudit state={state} />}

      {view === 'route' && <>
        <div className="act-tabs custom-scrollbar">{Array.from({ length: 10 }, (_, index) => index + 1).map((act) => <button className={act === selectedAct ? 'active' : ''} onClick={() => setSelectedAct(act)} key={act}><span>ACT</span>{act}</button>)}</div>
        <div className="g2-filters">{([['all', 'Everything'], ['critical', 'Critical'], ['passives', '+ Passives'], ['trials', '△ Trials'], ['labyrinth', '♜ Labyrinth'], ['build', '⬡ Build']] as Array<[RouteFilter, string]>).map(([id, label]) => <button className={filter === id ? 'active' : ''} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>

        <div className="g2-route-layout">
          <aside className="g2-step-list custom-scrollbar">
            {visible.map((index) => {
              const step = state.dataset.steps[index];
              const status = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
              const importance = importanceFor(step);
              const item = rewardFor(state, step);
              const lab = guideCalloutsForStep(step).find((callout) => callout.kind === 'labyrinth');
              return <button className={`${inspectedIndex === index ? 'active' : ''} state-${status} importance-${importance}`} key={step.id} onClick={() => setInspectedIndex(index)}><span className="step-state">{status === 'complete' ? '✓' : status === 'current' ? '●' : '○'}</span><div><strong>{summarizeActions(step.actions).now?.title ?? step.title}</strong><small>{step.targetArea ?? `Act ${step.act}`}</small></div>{lab ? <i>LAB</i> : step.permanentReward && <i className={item?.status === 'confirmed' ? 'reward-confirmed' : ''}>{item?.status === 'confirmed' ? '✓' : step.permanentReward === 'passive' ? '+1' : 'TRIAL'}</i>}</button>;
            })}
            {!visible.length && <div className="g2-empty">No route steps match this filter in Act {selectedAct}.</div>}
          </aside>

          <main className="g2-detail custom-scrollbar">
            <header className="g2-step-header"><div><span>ACT {inspected.act} · STEP {inspected.indexInAct + 1}</span><h2>{summary.now?.title ?? inspected.title}</h2><p>{inspected.targetArea ?? 'Campaign route'}{inspected.areaLevel ? ` · Area level ${inspected.areaLevel}` : ''}</p></div><em className={`importance-${importanceFor(inspected)}`}>{importanceFor(inspected).toUpperCase()}</em></header>

            {callouts.length > 0 && <section className="g2-callout-stack">{callouts.map((callout) => <Callout key={callout.id} callout={callout} />)}</section>}

            <section className="g2-instruction-grammar">
              <div className="g2-now"><span>NOW</span><h3>{summary.now?.title ?? inspected.title}</h3>{summary.now?.detail && <p>{summary.now.detail}</p>}</div>
              {summary.then.length > 0 && <div className="g2-then"><span>THEN</span>{summary.then.filter((action) => action.type !== 'build').slice(0, 7).map((action) => <ActionLine action={action} key={action.id} />)}</div>}
              {inspected.actions.filter((action) => action.type === 'build').length > 0 && <div className="g2-build"><span>BUILD</span>{inspected.actions.filter((action) => action.type === 'build').map((action) => <ActionLine action={action} key={action.id} />)}</div>}
              {inspected.annotation?.warning && <div className="g2-dont"><span>DON'T MISS</span><strong>{inspected.annotation.warning}</strong></div>}
            </section>

            <BuildToolkit state={state} step={inspected} />
            <LayoutSketch step={inspected} />

            {(inspected.annotation?.summary || inspected.annotation?.why || inspected.annotation?.speedrun || inspected.actions.some((action) => action.priority === 'context')) && <details className="g2-more" open={state.settings.guidanceMode === 'beginner'}><summary>More guidance</summary><div>
              {inspected.annotation?.summary && <section><span>COACH</span><p>{inspected.annotation.summary}</p></section>}
              {state.settings.guidanceMode === 'beginner' && inspected.annotation?.details?.map((detail) => <section key={detail}><span>DETAIL</span><p>{detail}</p></section>)}
              {state.settings.guidanceMode !== 'racer' && inspected.annotation?.why && <section><span>WHY?</span><p>{inspected.annotation.why}</p></section>}
              {inspected.annotation?.speedrun && <section><span>FAST ROUTE</span><p>{inspected.annotation.speedrun}</p></section>}
              {inspected.actions.filter((action) => action.priority === 'context').map((action) => <section key={action.id}><span>ROUTE CLUE</span><p>{action.title}</p></section>)}
            </div></details>}

            {reward && <section className={`g2-reward audit-${reward.status}`}><div><span>PERMANENT REWARD</span><strong>{reward.type === 'passive' ? 'Passive skill point quest' : 'Ascendancy Trial'} · {reward.status === 'confirmed' ? 'confirmed' : reward.status === 'route-passed' ? 'needs confirmation' : 'not reached'}</strong><p>Route progress never counts this as collected until you confirm it.</p></div><button className={reward.status === 'confirmed' ? 'ghost-button' : 'primary-button'} onClick={() => void window.exileQuesting.confirmReward(reward.stepId, reward.status !== 'confirmed').then(setState)}>{reward.status === 'confirmed' ? 'Unconfirm' : 'Confirm'}</button></section>}

            <footer className="g2-step-actions">{inspectedIndex !== currentIndex ? <button className="primary-button" onClick={() => void window.exileQuesting.setProgress(inspectedIndex).then(setState)}>Resume route from here</button> : <button className="primary-button" onClick={() => void window.exileQuesting.setProgress(Math.min(state.dataset.steps.length - 1, currentIndex + 1)).then(setState)}>Complete step →</button>}</footer>
          </main>
        </div>
      </>}

      {lost && <LostPanel state={state} currentIndex={currentIndex} onInspect={inspect} onClose={() => setLost(false)} />}
    </div>
  );
}
