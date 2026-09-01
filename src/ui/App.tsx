import { useEffect, useMemo, useRef, useState } from 'react';
import { focusHint } from '../core/layouts';
import { isStepEnabled } from '../core/campaign';
import { summarizeActions } from '../core/actions';
import {
  DetectionTracePanel,
  OverlayRunClock,
  RecoveryBanner,
  RewardAuditPanel,
  RunDashboard,
  RunSettings,
  UpdatePanel,
} from './reliability';
import type {
  AppSettings,
  CampaignStep,
  OverlayMode,
  OverlayPositionPreset,
  OverlayTypography,
  OverlayTypographyPreset,
  RouteAction,
  RuntimeState,
} from '../core/types';

type Tab = 'overview' | 'guide' | 'knowledge' | 'settings' | 'diagnostics';

const NAV_ITEMS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'guide', label: 'Campaign', icon: '◇' },
  { id: 'knowledge', label: 'Knowledge', icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '◌' },
];

const ACTION_ICONS: Record<RouteAction['type'], string> = {
  travel: '→', kill: '⚔', talk: '●', collect: '◆', 'quest-item': '◆', reward: '◇', waypoint: '◈', passive: '+', trial: '△',
  vendor: '¤', gem: '✦', portal: '○', relog: '↩', craft: '⌁', build: '⬡', warning: '!', context: '·',
};

const POSITION_PRESETS: Array<[OverlayPositionPreset, string]> = [
  ['top-left', 'Top left'], ['top-center', 'Top center'], ['top-right', 'Top right'],
  ['middle-left', 'Middle left'], ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'],
];

const TYPOGRAPHY_PRESETS: Record<Exclude<OverlayTypographyPreset, 'custom'>, Omit<OverlayTypography, 'preset' | 'density'>> = {
  compact: { objective: 18, actions: 13, guidance: 11, labels: 9, status: 9 },
  default: { objective: 21, actions: 15, guidance: 13, labels: 10, status: 10 },
  large: { objective: 24, actions: 17, guidance: 15, labels: 11, status: 11 },
  'extra-large': { objective: 28, actions: 20, guidance: 17, labels: 13, status: 13 },
};

function useRuntime(): [RuntimeState | null, (state: RuntimeState) => void] {
  const [state, setState] = useState<RuntimeState | null>(null);
  useEffect(() => {
    void window.exileQuesting.bootstrap().then(setState);
    return window.exileQuesting.onState(setState);
  }, []);
  return [state, setState];
}

function enabledIndices(state: RuntimeState): number[] {
  return state.dataset.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => isStepEnabled(step, state.settings))
    .map(({ index }) => index);
}

function nearestEnabledIndex(state: RuntimeState, from = state.progress, direction = 1): number {
  let index = from;
  while (index >= 0 && index < state.dataset.steps.length) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
    index += direction;
  }
  return Math.max(0, Math.min(from, state.dataset.steps.length - 1));
}

function nextEnabledIndex(state: RuntimeState, from = state.progress): number | null {
  for (let index = from + 1; index < state.dataset.steps.length; index += 1) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
  }
  return null;
}

function StepTags({ step }: { step: CampaignStep }) {
  const labels: Record<string, string> = {
    waypoint: 'Waypoint', passive: 'Passive', trial: 'Trial', boss: 'Boss', logout: 'Relog', optional: 'Optional', gems: 'Gems', craft: 'Recipe',
  };
  return (
    <div className="tag-row">
      {step.tags.map((tag) => <span className={`tag tag-${tag}`} key={tag}>{labels[tag] ?? tag}</span>)}
    </div>
  );
}

function ActionLine({ action, compact = false }: { action: RouteAction; compact?: boolean }) {
  return (
    <div className={`action-line action-${action.type} ${action.critical ? 'critical' : ''} ${compact ? 'compact' : ''}`}>
      <span className="action-icon">{ACTION_ICONS[action.type]}</span>
      <span>{action.title}</span>
    </div>
  );
}

function Guidance({ step, mode }: { step: CampaignStep; mode: AppSettings['guidanceMode'] }) {
  const annotation = step.annotation;
  if (!annotation) return null;
  return (
    <div className="guidance-stack">
      {annotation.summary && <div className="guidance-card summary"><span>Coach</span><p>{annotation.summary}</p></div>}
      {mode === 'beginner' && annotation.details?.map((detail) => <div className="detail-line" key={detail}><i>i</i>{detail}</div>)}
      {annotation.warning && <div className="guidance-card warning"><span>Don't miss</span><p>{annotation.warning}</p></div>}
      {mode !== 'racer' && annotation.why && <details className="why-card" open={mode === 'beginner'}><summary>Why are we doing this?</summary><p>{annotation.why}</p></details>}
      {annotation.speedrun && <div className="guidance-card speed"><span>Fast route</span><p>{annotation.speedrun}</p></div>}
    </div>
  );
}

function ProgressControls({ state, compact = false }: { state: RuntimeState; compact?: boolean }) {
  const move = (direction: number) => {
    let index = state.progress + direction;
    while (index >= 0 && index < state.dataset.steps.length && !isStepEnabled(state.dataset.steps[index], state.settings)) index += direction;
    if (index >= 0 && index < state.dataset.steps.length) void window.exileQuesting.setProgress(index);
  };
  return (
    <div className={`progress-controls ${compact ? 'compact' : ''}`}>
      <button className="icon-button" onClick={() => move(-1)} aria-label="Previous step">←</button>
      {!compact && <span>Step {state.progress + 1} of {state.dataset.steps.length}</span>}
      <button className="primary-button" onClick={() => move(1)}>{compact ? '✓' : 'Complete step'} {!compact && '→'}</button>
    </div>
  );
}

function Overlay({ state }: { state: RuntimeState }) {
  const rootRef = useRef<HTMLElement>(null);
  const index = nearestEnabledIndex(state);
  const step = state.dataset.steps[index];
  const nextIndex = nextEnabledIndex(state, index);
  const nextStep = nextIndex === null ? undefined : state.dataset.steps[nextIndex];
  const actions = summarizeActions(step.actions);
  const nextActions = nextStep ? summarizeActions(nextStep.actions) : undefined;
  const hint = focusHint(step.layoutHints ?? []);
  const [zoneIntro, setZoneIntro] = useState(false);

  useEffect(() => {
    setZoneIntro(true);
    const timer = window.setTimeout(() => setZoneIntro(false), state.settings.overlayAutoCollapse ? state.settings.overlayAutoCollapseSeconds * 1000 : 4000);
    return () => window.clearTimeout(timer);
  }, [state.currentAreaId, state.currentZone, state.settings.overlayAutoCollapse, state.settings.overlayAutoCollapseSeconds]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const report = () => void window.exileQuesting.reportOverlayContentHeight(Math.ceil(element.scrollHeight + 2));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [state.settings.overlayMode, state.settings.overlayTypography, state.settings.guidanceMode, state.progress, zoneIntro]);

  const actSteps = state.dataset.steps.filter((candidate) => candidate.act === step.act);
  const actProgress = Math.round(((step.indexInAct + 1) / Math.max(1, actSteps.length)) * 100);
  const location = state.currentZone ?? 'Waiting for zone detection';
  const warning = step.annotation?.warning;
  const permanent = step.permanentReward;
  const typography = state.settings.overlayTypography;
  const style = {
    '--overlay-scale': state.settings.overlayScale,
    '--font-objective': `${typography.objective}px`,
    '--font-actions': `${typography.actions}px`,
    '--font-guidance': `${typography.guidance}px`,
    '--font-labels': `${typography.labels}px`,
    '--font-status': `${typography.status}px`,
  } as React.CSSProperties;

  return (
    <main ref={rootRef} className={`overlay-shell overlay-${state.settings.overlayMode} density-${typography.density} ${state.settings.reducedMotion ? 'reduced-motion' : ''} ${state.settings.reducedTransparency ? 'solid' : ''}`} style={style}>
      <header className="overlay-header drag-region">
        <div className="brand-mark small">EQ</div>
        <div className="overlay-location">
          <span className="eyebrow">ACT {step.act} · {actProgress}%</span>
          <strong>{location}</strong>
        </div>
        <OverlayRunClock state={state} />
        <div className={`connection-dot ${state.logConnected ? 'connected' : ''}`} title={state.logConnected ? 'Client.txt connected' : 'Manual tracking'} />
        <button className="window-button no-drag" onClick={() => void window.exileQuesting.hideOverlay()} aria-label="Hide overlay">×</button>
      </header>
      <div className="act-progress"><i style={{ width: `${actProgress}%` }} /></div>

      {zoneIntro && state.currentZone && state.settings.overlayMode !== 'compact' && (
        <div className="zone-intro">
          <span>ZONE DETECTED</span><strong>{state.currentZone}</strong>
          {state.characterLevel && state.currentAreaLevel && <small>Level {state.characterLevel} · Area {state.currentAreaLevel}</small>}
        </div>
      )}

      <section className="overlay-content">
        {state.settings.overlayMode !== 'compact' && <StepTags step={step} />}
        <div className="now-block">
          <span className="section-kicker">NOW</span>
          <h1>{actions.now?.title ?? step.title}</h1>
        </div>

        {state.settings.overlayMode === 'compact' ? (
          <>
            {warning && <div className="dont-miss compact"><b>!</b><span>{warning}</span></div>}
            {nextActions?.now && <div className="next-strip"><span>NEXT</span><strong>{nextActions.now.title}</strong></div>}
          </>
        ) : (
          <>
            {actions.then.length > 0 && (
              <div className="action-stack">
                {actions.then.slice(0, state.settings.overlayMode === 'focus' ? 4 : 8).map((action) => <ActionLine key={action.id} action={action} />)}
              </div>
            )}

            {(warning || permanent) && (
              <div className="dont-miss">
                <span className="section-kicker">DON'T MISS</span>
                <strong>{warning ?? (permanent === 'passive' ? 'Permanent passive-point reward' : 'Ascendancy trial')}</strong>
              </div>
            )}

            {nextActions?.now && (
              <div className="next-strip"><span>NEXT</span><strong>{nextActions.now.title}</strong>{nextStep?.targetArea && <small>{nextStep.targetArea}</small>}</div>
            )}

            {hint && state.settings.overlayMode === 'focus' && (
              <div className="micro-intel"><span>LAYOUT · {hint.confidence.toUpperCase()}</span><p>{hint.text}</p></div>
            )}

            {state.xpGuidance.pace !== 'unknown' && state.settings.overlayMode === 'focus' && (
              <div className={`xp-strip xp-${state.xpGuidance.pace}`}>
                <span>YOU {state.characterLevel} · AREA {state.currentAreaLevel}</span>
                <strong>{state.xpGuidance.pace === 'efficient' ? 'XP GOOD' : state.xpGuidance.pace.toUpperCase()}</strong>
              </div>
            )}

            {state.settings.overlayMode === 'coach' && (
              <>
                {actions.context.length > 0 && <div className="context-actions">{actions.context.map((action) => <ActionLine key={action.id} action={action} />)}</div>}
                {hint && <div className="micro-intel expanded"><span>LAYOUT · {hint.confidence.toUpperCase()}</span><p>{hint.text}</p></div>}
                {state.xpGuidance.pace !== 'unknown' && <div className="coach-xp"><span>XP guidance</span><p>{state.xpGuidance.message}</p></div>}
                <Guidance step={step} mode={state.settings.guidanceMode} />
              </>
            )}
          </>
        )}
      </section>

      <footer className="overlay-footer">
        <span>{state.logConnected ? 'Live tracking' : 'Manual tracking'}{state.currentZone ? ` · ${state.currentZone}` : ''}</span>
        <div className="overlay-footer-actions no-drag">
          {state.settings.overlayMode !== 'coach' && <button className="mode-button" onClick={() => void window.exileQuesting.setSettings({ overlayMode: 'coach' })}>More</button>}
          {state.settings.overlayMode === 'coach' && <button className="mode-button" onClick={() => void window.exileQuesting.setSettings({ overlayMode: 'focus' })}>Focus</button>}
          <ProgressControls state={state} compact />
        </div>
      </footer>
    </main>
  );
}

function StatusPill({ state }: { state: RuntimeState }) {
  const status = state.sourceStatus;
  const tone = ['error', 'fallback'].includes(status.state) ? 'warning' : status.state === 'checking' ? 'checking' : 'ok';
  return <span className={`status-pill ${tone}`}><i />{status.state === 'checking' ? 'Checking data' : tone === 'warning' ? 'Fallback active' : 'Campaign verified'}</span>;
}

function StartupReconcile({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  if (state.startupReconciliation.state !== 'suggested') return null;
  return (
    <div className="modal-backdrop">
      <section className="modal-card reconciliation-card">
        <span className="eyebrow">RESUME CAMPAIGN</span>
        <h2>We found a different current zone.</h2>
        <p>Detected <strong>{state.startupReconciliation.detectedAreaName ?? state.startupReconciliation.detectedAreaId}</strong>, while your saved route is on step {(state.startupReconciliation.savedProgress ?? 0) + 1}.</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={() => void window.exileQuesting.reconcileStartup(false).then(setState)}>Keep saved progress</button>
          <button className="primary-button" onClick={() => void window.exileQuesting.reconcileStartup(true).then(setState)}>Resume from detected zone</button>
        </div>
      </section>
    </div>
  );
}

function Overview({ state, setState, onNavigate }: { state: RuntimeState; setState: (state: RuntimeState) => void; onNavigate: (tab: Tab) => void }) {
  const index = nearestEnabledIndex(state);
  const step = state.dataset.steps[index];
  const nextIndex = nextEnabledIndex(state, index);
  const next = nextIndex === null ? undefined : state.dataset.steps[nextIndex];
  const actions = summarizeActions(step.actions);
  const completed = Math.round((state.progress / Math.max(1, state.dataset.steps.length - 1)) * 100);
  return (
    <div className="page custom-scrollbar">
      <RecoveryBanner state={state} setState={setState} />
      {['available', 'ready'].includes(state.appUpdate.status) && <div className="update-banner"><div><span>UPDATE</span><strong>ExileQuesting {state.appUpdate.latestVersion} {state.appUpdate.status === 'ready' ? 'is ready to install' : 'is available'}</strong></div><button className="ghost-button" onClick={() => onNavigate('settings')}>View update</button></div>}
      <div className="page-heading">
        <div><span className="eyebrow">LIVE CAMPAIGN</span><h1>{state.currentZone ?? 'Ready for Wraeclast.'}</h1><p>Everything you need for the next decision, without alt-tabbing.</p></div>
        <button className="primary-button large" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button>
      </div>

      <div className="metric-grid run-metrics">
        <article className="metric hero-metric"><span>Campaign progress</span><strong>{completed}%</strong><div className="metric-bar"><i style={{ width: `${completed}%` }} /></div><small>Act {step.act} · Step {step.indexInAct + 1}</small></article>
        <article className="metric"><span>Current objective</span><strong className="text-value">{actions.now?.title ?? step.title}</strong><small>{step.targetArea ?? state.currentZone ?? 'Waiting for zone detection'}</small></article>
        <article className={`metric xp-metric xp-${state.xpGuidance.pace}`}><span>Level pacing</span><strong className="text-value">{state.xpGuidance.pace === 'unknown' ? 'Waiting for data' : state.xpGuidance.pace === 'efficient' ? 'XP good' : state.xpGuidance.pace}</strong><small>{state.characterLevel ? `You ${state.characterLevel}` : 'You ?'} · {state.currentAreaLevel ? `Area ${state.currentAreaLevel}` : 'Area ?'}</small></article>
      </div>

      <section className="dashboard-grid">
        <article className="panel next-step-panel">
          <div className="panel-heading"><div><span className="eyebrow">NOW</span><h2>{actions.now?.title ?? step.title}</h2></div><StepTags step={step} /></div>
          <div className="manager-actions">{actions.then.slice(0, 5).map((action) => <ActionLine key={action.id} action={action} />)}</div>
          {step.annotation?.warning && <div className="inline-alert"><strong>Don't miss</strong>{step.annotation.warning}</div>}
          {next && <div className="dashboard-next"><span>NEXT</span><strong>{summarizeActions(next.actions).now?.title ?? next.title}</strong></div>}
          <div className="panel-actions"><button className="ghost-button" onClick={() => onNavigate('guide')}>View full route</button><ProgressControls state={state} /></div>
        </article>
        <aside className="side-stack">
          <article className="panel compact-panel"><span className="eyebrow">PERMANENT REWARDS</span><div className="reward-stats"><div><strong>{state.rewardAudit.passive.confirmed}/{state.rewardAudit.passive.knownTotal}</strong><span>Passives confirmed</span></div><div><strong>{state.rewardAudit.trials.confirmed}/{state.rewardAudit.trials.knownTotal}</strong><span>Trials confirmed</span></div></div><small className="panel-copy">Route-passed is tracked separately until you explicitly confirm it.</small></article>
          <article className="panel compact-panel"><span className="eyebrow">LIVE TRACKING</span><div className="connection-row"><i className={state.logConnected ? 'online' : ''} /><div><strong>{state.logConnected ? 'Client.txt connected' : 'Manual mode'}</strong><small>{state.currentAreaId ? `Internal area ${state.currentAreaId}` : state.settings.logPath || 'Choose the game log in Settings'}</small></div></div></article>
          <article className="panel compact-panel"><span className="eyebrow">BUILD</span><h3 className="placeholder-title">No build imported yet</h3><p className="panel-copy">PoB-aware gem, tree and gear milestones arrive in the next major milestone.</p></article>
        </aside>
      </section>
      <div className="overview-secondary-grid"><RunDashboard state={state} setState={setState} /><RewardAuditPanel state={state} setState={setState} compact /></div>
    </div>
  );
}

function CampaignGuide({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const currentIndex = nearestEnabledIndex(state);
  const current = state.dataset.steps[currentIndex];
  const [selectedAct, setSelectedAct] = useState(current.act);
  const [inspectedIndex, setInspectedIndex] = useState(currentIndex);
  useEffect(() => {
    setSelectedAct(current.act);
    setInspectedIndex(currentIndex);
  }, [current.id, current.act, currentIndex]);
  const visible = enabledIndices(state).filter((index) => state.dataset.steps[index].act === selectedAct);
  const inspected = state.dataset.steps[inspectedIndex] ?? current;
  const inspectedActions = summarizeActions(inspected.actions);
  const rewardItem = state.rewardAudit.items.find((item) => item.stepId === inspected.id);
  return (
    <div className="page guide-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">ACTS 1–10</span><h1>Campaign route</h1><p>Inspect the route freely. Progress only moves when you explicitly resume or complete a step.</p></div><button className="ghost-button" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button></div>
      <div className="act-tabs custom-scrollbar">{Array.from({ length: 10 }, (_, index) => index + 1).map((act) => <button className={act === selectedAct ? 'active' : ''} onClick={() => setSelectedAct(act)} key={act}><span>ACT</span>{act}</button>)}</div>
      <div className="guide-layout">
        <aside className="step-list custom-scrollbar">
          {visible.map((index) => {
            const step = state.dataset.steps[index];
            const status = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
            const reward = state.rewardAudit.items.find((item) => item.stepId === step.id);
            return <button className={`${inspectedIndex === index ? 'active' : ''} state-${status}`} key={step.id} onClick={() => setInspectedIndex(index)}><span className="step-state">{status === 'complete' ? '✓' : status === 'current' ? '●' : '○'}</span><div><strong>{summarizeActions(step.actions).now?.title ?? step.title}</strong><small>{step.targetArea ?? `Act ${step.act}`}</small></div>{step.permanentReward && <i className={reward?.status === 'confirmed' ? 'reward-confirmed' : ''}>{reward?.status === 'confirmed' ? '✓' : step.permanentReward === 'passive' ? '+1' : 'TRIAL'}</i>}</button>;
          })}
        </aside>
        <article className="panel step-detail custom-scrollbar">
          <div className="step-title-row"><div><span className="eyebrow">ACT {inspected.act} · ROUTE STEP {inspected.indexInAct + 1}</span><h2>{inspectedActions.now?.title ?? inspected.title}</h2><p>{inspected.targetArea}{inspected.areaLevel ? ` · Area level ${inspected.areaLevel}` : ''}</p></div><StepTags step={inspected} /></div>
          <div className="manager-actions prominent">{inspected.actions.filter((action) => action.priority !== 'context').map((action) => <ActionLine key={action.id} action={action} />)}</div>
          {inspected.actions.some((action) => action.priority === 'context') && <div className="context-actions manager-context">{inspected.actions.filter((action) => action.priority === 'context').map((action) => <ActionLine key={action.id} action={action} />)}</div>}
          {focusHint(inspected.layoutHints ?? []) && <div className="micro-intel expanded"><span>LAYOUT · {focusHint(inspected.layoutHints ?? [])?.confidence.toUpperCase()}</span><p>{focusHint(inspected.layoutHints ?? [])?.text}</p></div>}
          <Guidance step={inspected} mode={state.settings.guidanceMode} />
          {rewardItem && <div className={`reward-confirm-card audit-${rewardItem.status}`}><div><span>PERMANENT REWARD</span><strong>{rewardItem.status === 'confirmed' ? 'Confirmed' : rewardItem.status === 'route-passed' ? 'Route passed, confirmation needed' : 'Not reached yet'}</strong><p>Automatic route progress never pretends this reward is confirmed. Mark it when you actually complete/claim it.</p></div><button className={rewardItem.status === 'confirmed' ? 'ghost-button' : 'primary-button'} onClick={() => void window.exileQuesting.confirmReward(rewardItem.stepId, rewardItem.status !== 'confirmed').then(setState)}>{rewardItem.status === 'confirmed' ? 'Unconfirm' : 'Confirm reward'}</button></div>}
          <div className="inspect-actions">
            {inspectedIndex !== currentIndex && <button className="primary-button" onClick={() => void window.exileQuesting.setProgress(inspectedIndex).then(setState)}>Resume from this step</button>}
            {inspectedIndex === currentIndex && <ProgressControls state={state} />}
          </div>
        </article>
      </div>
    </div>
  );
}

const KNOWLEDGE = [
  { n: '01', title: 'Town time is real time', body: 'Know your gem reward, socket colours, vendor search, and passive choices before opening a town panel. The fastest route is useless if every town visit becomes a planning session.' },
  { n: '02', title: 'Kill density, not everything', body: 'Prioritize compact normal packs and valuable magic packs while moving. Skip isolated tanky rares unless your build needs the experience.' },
  { n: '03', title: 'Movement compounds', body: 'Movement-speed boots, Quicksilver uptime, and a usable movement skill save time in every zone. Early upgrades here pay for themselves repeatedly.' },
  { n: '04', title: 'Use exits as resources', body: 'A planned relog returns you to town without a Portal Scroll. Deliberate portals turn branching zones into short loops.' },
  { n: '05', title: 'Read layout tells', body: 'Roads, streams, shorelines, waypoint orientation, room size, and repeated corner relationships are clues, not guarantees. ExileQuesting shows confidence where it matters.' },
  { n: '06', title: 'Permanent means permanent', body: 'Story-optional is not the same as character-power optional. Passive points and Ascendancy trials are surfaced separately from ordinary detours.' },
];

function Knowledge() {
  return <div className="page custom-scrollbar"><div className="page-heading compact-heading"><div><span className="eyebrow">RESEARCH → PRACTICE</span><h1>Run smarter</h1><p>The repeatable habits behind faster, less confusing campaigns.</p></div></div><div className="knowledge-grid">{KNOWLEDGE.map((item) => <article className="panel knowledge-card" key={item.n}><span>{item.n}</span><h2>{item.title}</h2><p>{item.body}</p></article>)}</div><article className="panel safety-panel"><div className="shield">◇</div><div><span className="eyebrow">SAFE BY DESIGN</span><h2>We observe and advise. We never play.</h2><p>ExileQuesting reads the log file you select and displays guidance. It does not inspect process memory, inject code, click, move, craft, or trigger game inputs from detected events.</p></div></article></div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return <button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked} aria-label={label}><i /></button>;
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><small>{description}</small></div>{children}</div>;
}

function SliderField({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="slider-field"><span><b>{label}</b><em>{value}{suffix}</em></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Settings({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const update = (patch: Partial<AppSettings>) => void window.exileQuesting.setSettings(patch).then(setState);
  const typography = state.settings.overlayTypography;
  const setTypography = (patch: Partial<OverlayTypography>) => update({ overlayTypography: { ...typography, ...patch, preset: patch.preset ?? 'custom' } });
  const applyTypographyPreset = (preset: Exclude<OverlayTypographyPreset, 'custom'>) => update({ overlayTypography: { ...typography, ...TYPOGRAPHY_PRESETS[preset], preset } });
  return (
    <div className="page custom-scrollbar">
      <div className="page-heading compact-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Settings</h1><p>Sensible defaults, with control where it actually matters.</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-section">
          <div className="section-title"><h2>Game connection</h2><span>Client.txt is read-only</span></div>
          <div className="file-picker"><div><strong>{state.logConnected ? 'Path of Exile connected' : state.settings.logPath ? 'Game log selected' : 'Game log not found'}</strong><small>{state.settings.logPath || 'Steam libraries and common standalone locations are checked automatically.'}</small></div><button className="ghost-button" onClick={() => void window.exileQuesting.selectLogFile().then(setState)}>Browse…</button></div>
          <SettingRow title="Automatic route progress" description="Advance only from verified or bounded inferred area transitions."><Toggle checked={state.settings.autoAdvance} onChange={(autoAdvance) => update({ autoAdvance })} label="Automatic route progress" /></SettingRow>
          <SettingRow title="Show overlay on zone change" description="Bring the overlay back when a new campaign area loads."><Toggle checked={state.settings.autoShowOnZoneChange} onChange={(autoShowOnZoneChange) => update({ autoShowOnZoneChange })} label="Show overlay on zone change" /></SettingRow>
        </section>

        <section className="panel settings-section">
          <div className="section-title"><h2>Route profile</h2><span>Changes visible branches</span></div>
          <label className="field"><span>Guidance depth</span><select value={state.settings.guidanceMode} onChange={(event) => update({ guidanceMode: event.target.value as AppSettings['guidanceMode'] })}><option value="beginner">Beginner — explain everything</option><option value="balanced">Balanced — key context</option><option value="racer">Racer — route only</option></select></label>
          <label className="field"><span>Bandit choice</span><select value={state.settings.bandit} onChange={(event) => update({ bandit: event.target.value as AppSettings['bandit'] })}><option value="none">Kill all three</option><option value="alira">Help Alira</option><option value="kraityn">Help Kraityn</option><option value="oak">Help Oak</option></select></label>
          <SettingRow title="League-start route" description="Show first-character vendor, trial, and gearing steps."><Toggle checked={state.settings.leagueStart} onChange={(leagueStart) => update({ leagueStart })} /></SettingRow>
          <SettingRow title="Optional objectives" description="Include useful detours and non-mandatory loot checks."><Toggle checked={state.settings.showOptional} onChange={(showOptional) => update({ showOptional })} /></SettingRow>
        </section>

        <RunSettings state={state} update={update} />
        <UpdatePanel state={state} setState={setState} />

        <section className="panel settings-section overlay-settings wide-section">
          <div className="section-title"><h2>Overlay V2</h2><span>Glance first, detail on demand</span></div>
          <div className="segmented-control three">{(['compact', 'focus', 'coach'] as OverlayMode[]).map((mode) => <button className={state.settings.overlayMode === mode ? 'active' : ''} key={mode} onClick={() => update({ overlayMode: mode })}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div>
          <p className="setting-note"><b>Focus</b> is the recommended default. Compact strips the overlay down further. Coach expands explanations, layout context, and teaching.</p>
          <SliderField label="Overall UI scale" value={Math.round(state.settings.overlayScale * 100)} min={75} max={150} suffix="%" onChange={(value) => update({ overlayScale: value / 100 })} />
          <SliderField label="Opacity" value={Math.round(state.settings.overlayOpacity * 100)} min={35} max={100} suffix="%" onChange={(value) => update({ overlayOpacity: value / 100 })} />
          <SettingRow title="Click-through overlay" description={`Mouse input passes to the game. Toggle interaction with ${state.settings.hotkeys.toggleInteraction}.`}><Toggle checked={state.settings.overlayClickThrough} onChange={(overlayClickThrough) => update({ overlayClickThrough })} /></SettingRow>
          <SettingRow title="Auto-collapse zone intro" description="Briefly announce a new zone, then return to the selected HUD mode."><Toggle checked={state.settings.overlayAutoCollapse} onChange={(overlayAutoCollapse) => update({ overlayAutoCollapse })} /></SettingRow>
        </section>

        <section className="panel settings-section wide-section">
          <div className="section-title"><h2>Overlay typography</h2><span>Readable from a glance</span></div>
          <div className="segmented-control four">{(['compact', 'default', 'large', 'extra-large'] as const).map((preset) => <button className={typography.preset === preset ? 'active' : ''} key={preset} onClick={() => applyTypographyPreset(preset)}>{preset === 'extra-large' ? 'Extra large' : preset[0].toUpperCase() + preset.slice(1)}</button>)}</div>
          <div className="typography-grid">
            <SliderField label="Main objective" value={typography.objective} min={16} max={34} suffix="px" onChange={(objective) => setTypography({ objective })} />
            <SliderField label="Actions" value={typography.actions} min={11} max={24} suffix="px" onChange={(actions) => setTypography({ actions })} />
            <SliderField label="Guidance" value={typography.guidance} min={10} max={21} suffix="px" onChange={(guidance) => setTypography({ guidance })} />
            <SliderField label="Labels" value={typography.labels} min={9} max={16} suffix="px" onChange={(labels) => setTypography({ labels })} />
            <SliderField label="Status/footer" value={typography.status} min={9} max={16} suffix="px" onChange={(status) => setTypography({ status })} />
          </div>
          <label className="field"><span>Line spacing</span><select value={typography.density} onChange={(event) => setTypography({ density: event.target.value as OverlayTypography['density'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
        </section>

        <section className="panel settings-section wide-section">
          <div className="section-title"><h2>Position & accessibility</h2><span>Per-screen safe placement</span></div>
          <div className="position-grid">{POSITION_PRESETS.map(([preset, label]) => <button className={state.settings.overlayPosition.preset === preset ? 'active' : ''} key={preset} onClick={() => update({ overlayPosition: { ...state.settings.overlayPosition, preset } })}>{label}</button>)}</div>
          <div className="setting-actions"><button className="ghost-button" onClick={() => void window.exileQuesting.showOverlay()}>Test overlay</button><button className="ghost-button" onClick={() => void window.exileQuesting.resetOverlayPosition().then(setState)}>Reset position</button></div>
          <SettingRow title="Lock overlay position" description="Prevent accidental moving/resizing after placement."><Toggle checked={state.settings.overlayPosition.locked} onChange={(locked) => update({ overlayPosition: { ...state.settings.overlayPosition, locked } })} /></SettingRow>
          <SettingRow title="Snap custom position to edges" description="Custom placement gently snaps when close to a display edge."><Toggle checked={state.settings.overlayPosition.snapToEdges} onChange={(snapToEdges) => update({ overlayPosition: { ...state.settings.overlayPosition, snapToEdges } })} /></SettingRow>
          <SettingRow title="Reduced motion" description="Disable non-essential transitions and animated resizing effects."><Toggle checked={state.settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} /></SettingRow>
          <SettingRow title="Reduced transparency" description="Use a fully opaque overlay surface for stronger contrast."><Toggle checked={state.settings.reducedTransparency} onChange={(reducedTransparency) => update({ reducedTransparency })} /></SettingRow>
        </section>
      </div>
    </div>
  );
}

function Diagnostics({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const lastHistory = [...state.progressHistory].reverse().slice(0, 6);
  const step = state.dataset.steps[state.progress];
  return (
    <div className="page custom-scrollbar diagnostics-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">HEALTH & COMPATIBILITY</span><h1>Diagnostics</h1><p>Enough detail to fix problems without turning the UI into a debug novel.</p></div><div className="heading-actions"><button className="ghost-button" onClick={() => void window.exileQuesting.copyDiagnostics()}>Copy diagnostics</button><button className="ghost-button" onClick={() => void window.exileQuesting.exportDiagnostics()}>Export report</button><button className="ghost-button" onClick={() => void window.exileQuesting.openDiagnosticsFolder()}>Open logs folder</button></div></div>
      {state.recovery.previousSessionUnclean && <div className="diagnostic-recovery"><strong>Previous abnormal shutdown detected</strong><span>Previous version {state.recovery.previousAppVersion ?? '?'} · route step {(state.recovery.previousProgress ?? 0) + 1}</span></div>}
      <div className="diagnostic-grid">
        <section className="panel diagnostic-card"><div className="section-title"><h2>Client tracking</h2><span>{state.logConnected ? 'Healthy' : 'Needs attention'}</span></div><dl className="diagnostic-list"><dt>Path</dt><dd>{state.logDiagnostics.path || 'Not configured'}</dd><dt>File exists</dt><dd>{state.logDiagnostics.fileExists ? 'Yes' : 'No'}</dd><dt>Watcher</dt><dd>{state.logDiagnostics.watcherActive ? 'Active' : 'Inactive'}</dd><dt>Polling fallback</dt><dd>{state.logDiagnostics.pollingActive ? 'Active' : 'Inactive'}</dd><dt>Last file change</dt><dd>{state.logDiagnostics.lastFileChangeAt ?? 'None yet'}</dd><dt>Last parsed event</dt><dd>{state.logDiagnostics.lastParsedEventAt ?? 'None yet'}</dd><dt>Internal area</dt><dd>{state.currentAreaId ?? 'Unknown'}</dd><dt>Displayed zone</dt><dd>{state.currentZone ?? 'Unknown'}</dd><dt>Character / area level</dt><dd>{state.characterLevel ?? '?'} / {state.currentAreaLevel ?? '?'}</dd></dl>{state.logDiagnostics.lastError && <div className="inline-alert"><strong>Watcher error</strong>{state.logDiagnostics.lastError}</div>}</section>
        <section className="panel diagnostic-card"><div className="section-title"><h2>Route & run state</h2><span>{state.progress + 1}/{state.dataset.steps.length}</span></div><dl className="diagnostic-list"><dt>Semantic step ID</dt><dd>{step?.id}</dd><dt>Objective</dt><dd>{summarizeActions(step.actions).now?.title ?? step.title}</dd><dt>XP state</dt><dd>{state.xpGuidance.pace}</dd><dt>Run timer</dt><dd>{state.runStats.session.state}</dd><dt>Act splits</dt><dd>{state.runStats.session.splits.length}</dd><dt>Passive confirmed</dt><dd>{state.rewardAudit.passive.confirmed}/{state.rewardAudit.passive.knownTotal}</dd><dt>Trials confirmed</dt><dd>{state.rewardAudit.trials.confirmed}/{state.rewardAudit.trials.knownTotal}</dd></dl><div className="history-list">{lastHistory.length ? lastHistory.map((entry) => <div key={entry.id}><span>{new Date(entry.at).toLocaleTimeString()}</span><strong>{entry.from + 1} → {entry.to + 1}</strong><small>{entry.confidence} · {entry.reason}</small></div>) : <p>No progress changes recorded yet.</p>}</div><button className="ghost-button" disabled={!state.progressHistory.length} onClick={() => void window.exileQuesting.undoProgress().then(setState)}>Undo last progress change</button></section>
        <section className="panel diagnostic-card wide-diagnostic"><div className="section-title"><h2>Application & campaign data</h2><span>{state.sourceStatus.state}</span></div><div className="diagnostic-summary"><div><span>Application</span><strong>v{state.appVersion}</strong><small>{state.appUpdate.status}</small></div><div><span>Campaign source</span><strong>{state.dataset.source.repository}</strong><small>{state.dataset.source.commit.slice(0, 12)}</small></div><div><span>Schema</span><strong>v{state.dataset.schemaVersion}</strong></div><div><span>Route pages</span><strong>{state.dataset.steps.length}</strong></div></div><p className="source-message">{state.sourceStatus.message}</p><p className="source-message">App update: {state.appUpdate.message}</p><div className="diagnostic-actions"><button className="primary-button" disabled={state.sourceStatus.state === 'checking'} onClick={() => void window.exileQuesting.checkCampaignUpdates().then(setState)}>{state.sourceStatus.state === 'checking' ? 'Checking…' : 'Check campaign data'}</button><button className="ghost-button" disabled={state.appUpdate.status === 'checking'} onClick={() => void window.exileQuesting.checkAppUpdates().then(setState)}>Check app update</button></div></section>
        <DetectionTracePanel state={state} />
        <div className="wide-diagnostic"><RewardAuditPanel state={state} setState={setState} /></div>
      </div>
    </div>
  );
}

function Onboarding({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const [step, setStep] = useState(0);
  const update = (patch: Partial<AppSettings>) => void window.exileQuesting.setSettings(patch).then(setState);
  const pages = [
    <div className="onboarding-page" key="welcome"><span className="eyebrow">WELCOME</span><h1>Your campaign co-pilot.</h1><p>ExileQuesting watches the game log you approve, keeps the route in sync, and puts the next decision where you can glance at it.</p><div className="safety-mini"><strong>We observe and advise. We never play.</strong><span>No memory reading, injection, automatic clicks, skills, flasks, movement, or crafting.</span></div></div>,
    <div className="onboarding-page" key="connection"><span className="eyebrow">GAME CONNECTION</span><h1>{state.settings.logPath ? 'Path of Exile log found.' : 'Connect Path of Exile.'}</h1><p>{state.settings.logPath ? state.settings.logPath : 'Steam libraries and common standalone installs are checked automatically. You can browse manually if needed.'}</p><button className="ghost-button" onClick={() => void window.exileQuesting.selectLogFile().then(setState)}>Choose log file</button></div>,
    <div className="onboarding-page" key="guidance"><span className="eyebrow">GUIDANCE</span><h1>How much should we explain?</h1><div className="choice-cards">{(['beginner', 'balanced', 'racer'] as const).map((mode) => <button className={state.settings.guidanceMode === mode ? 'active' : ''} key={mode} onClick={() => update({ guidanceMode: mode })}><strong>{mode[0].toUpperCase() + mode.slice(1)}</strong><span>{mode === 'beginner' ? 'Teach the route and why it works.' : mode === 'balanced' ? 'Show important context without the lecture.' : 'Keep it terse and fast.'}</span></button>)}</div></div>,
    <div className="onboarding-page" key="overlay"><span className="eyebrow">OVERLAY</span><h1>Pick your default HUD.</h1><div className="choice-cards">{(['focus', 'compact', 'coach'] as const).map((mode) => <button className={state.settings.overlayMode === mode ? 'active' : ''} key={mode} onClick={() => update({ overlayMode: mode })}><strong>{mode[0].toUpperCase() + mode.slice(1)}</strong><span>{mode === 'focus' ? 'Recommended. NOW, NEXT and critical info.' : mode === 'compact' ? 'The smallest possible route HUD.' : 'Expanded teaching and route context.'}</span></button>)}</div><button className="primary-button" onClick={() => void window.exileQuesting.showOverlay()}>Test overlay</button></div>,
    <div className="onboarding-page" key="ready"><span className="eyebrow">READY</span><h1>You're ready for Wraeclast.</h1><p>Move the overlay where you want it, then use <b>{state.settings.hotkeys.toggleOverlay}</b> to show/hide it and <b>{state.settings.hotkeys.cycleOverlayMode}</b> to cycle HUD modes. Run timing can start automatically from the first campaign zones.</p><button className="primary-button large" onClick={() => update({ onboardingComplete: true })}>Start campaign</button></div>,
  ];
  return (
    <div className="modal-backdrop onboarding-backdrop"><section className="onboarding-card">{pages[step]}<footer><span>{step + 1} / {pages.length}</span><div>{step > 0 && <button className="ghost-button" onClick={() => setStep(step - 1)}>Back</button>}{step < pages.length - 1 && <button className="primary-button" onClick={() => setStep(step + 1)}>Continue</button>}</div></footer></section></div>
  );
}

function Manager({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const step = state.dataset.steps[nearestEnabledIndex(state)];
  const updateReady = ['available', 'ready'].includes(state.appUpdate.status);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">EQ</div><div><strong>ExileQuesting</strong><span>Campaign co-pilot</span></div></div>
        <nav>{NAV_ITEMS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><i>{item.icon}</i>{item.label}{item.id === 'settings' && updateReady && <b className="nav-badge">1</b>}</button>)}</nav>
        <div className="sidebar-footer"><StatusPill state={state} /><small>Not affiliated with or endorsed by Grinding Gear Games.</small></div>
      </aside>
      <section className="manager-main">
        <header className="topbar"><div><i className={`live-dot ${state.logConnected ? 'online' : ''}`} /><span>{state.logConnected ? `Tracking ${state.currentZone ?? 'zone changes'}` : 'Manual campaign tracking'}</span></div><div>{updateReady && <button className="topbar-update" onClick={() => setTab('settings')}>Update {state.appUpdate.latestVersion}</button>}<span>Act {step.act}</span><span>v{state.appVersion}</span><button className="topbar-button" onClick={() => void window.exileQuesting.showOverlay()}>Overlay ↗</button></div></header>
        {tab === 'overview' && <Overview state={state} setState={setState} onNavigate={setTab} />}
        {tab === 'guide' && <CampaignGuide state={state} setState={setState} />}
        {tab === 'knowledge' && <Knowledge />}
        {tab === 'settings' && <Settings state={state} setState={setState} />}
        {tab === 'diagnostics' && <Diagnostics state={state} setState={setState} />}
      </section>
      {!state.settings.onboardingComplete && <Onboarding state={state} setState={setState} />}
      <StartupReconcile state={state} setState={setState} />
    </div>
  );
}

export default function App() {
  const [state, setState] = useRuntime();
  if (!state) return <div className="loading-screen"><div className="brand-mark">EQ</div><span>Loading verified campaign data…</span></div>;
  const mode = new URLSearchParams(window.location.search).get('mode');
  return mode === 'overlay' ? <Overlay state={state} /> : <Manager state={state} setState={setState} />;
}
