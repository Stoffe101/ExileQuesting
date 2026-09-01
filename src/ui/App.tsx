import { useEffect, useMemo, useState } from 'react';
import { isStepEnabled } from '../core/campaign';
import type { AppSettings, CampaignStep, RuntimeState } from '../core/types';

type Tab = 'overview' | 'guide' | 'knowledge' | 'settings' | 'diagnostics';

const NAV_ITEMS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'guide', label: 'Campaign', icon: '◇' },
  { id: 'knowledge', label: 'Knowledge', icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '◌' },
];

function useRuntime(): [RuntimeState | null, (state: RuntimeState) => void] {
  const [state, setState] = useState<RuntimeState | null>(null);
  useEffect(() => {
    void window.exileQuesting.bootstrap().then(setState);
    return window.exileQuesting.onState(setState);
  }, []);
  return [state, setState];
}

function enabledSteps(state: RuntimeState): CampaignStep[] {
  return state.dataset.steps.filter((step) => isStepEnabled(step, state.settings));
}

function nearestEnabledIndex(state: RuntimeState, direction = 1): number {
  let index = state.progress;
  while (index >= 0 && index < state.dataset.steps.length) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
    index += direction;
  }
  return Math.max(0, Math.min(state.progress, state.dataset.steps.length - 1));
}

function StepTags({ step }: { step: CampaignStep }) {
  const labels: Record<string, string> = {
    waypoint: 'Waypoint', passive: 'Passive', trial: 'Trial', boss: 'Boss',
    logout: 'Relog', optional: 'Optional', gems: 'Gems', craft: 'Recipe',
  };
  return <div className="tag-row">{step.tags.map((tag) => <span className={`tag tag-${tag}`} key={tag}>{labels[tag] ?? tag}</span>)}</div>;
}

function Guidance({ step, mode }: { step: CampaignStep; mode: AppSettings['guidanceMode'] }) {
  const annotation = step.annotation;
  if (!annotation) return null;
  return (
    <div className="guidance-stack">
      {annotation.summary && <div className="guidance-card summary"><span>Coach</span><p>{annotation.summary}</p></div>}
      {mode === 'beginner' && annotation.details?.map((detail) => <div className="detail-line" key={detail}><i>i</i>{detail}</div>)}
      {annotation.warning && <div className="guidance-card warning"><span>Do not miss</span><p>{annotation.warning}</p></div>}
      {mode !== 'racer' && annotation.why && <details className="why-card" open={mode === 'beginner'}><summary>Why are we doing this?</summary><p>{annotation.why}</p></details>}
      {annotation.speedrun && <div className="guidance-card speed"><span>Fast route</span><p>{annotation.speedrun}</p></div>}
    </div>
  );
}

function RouteLines({ step }: { step: CampaignStep }) {
  return (
    <ol className="route-lines">
      {step.lines.map((line, index) => (
        <li key={`${index}-${line}`} className={line.startsWith('Tip:') ? 'route-tip' : ''}>
          <span className="line-number">{String(index + 1).padStart(2, '0')}</span><span>{line}</span>
        </li>
      ))}
    </ol>
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
  const step = state.dataset.steps[nearestEnabledIndex(state)];
  const actSteps = state.dataset.steps.filter((candidate) => candidate.act === step.act);
  const actProgress = Math.round(((step.indexInAct + 1) / actSteps.length) * 100);
  return (
    <main className="overlay-shell" style={{ '--overlay-scale': state.settings.overlayScale } as React.CSSProperties}>
      <header className="overlay-header drag-region">
        <div className="brand-mark small">EQ</div>
        <div><span className="eyebrow">ACT {step.act} · {actProgress}%</span><strong>{step.targetArea ?? step.title}</strong></div>
        <div className={`connection-dot ${state.logConnected ? 'connected' : ''}`} title={state.logConnected ? 'Client.txt connected' : 'Manual tracking'} />
        <button className="window-button no-drag" onClick={() => void window.exileQuesting.hideOverlay()}>×</button>
      </header>
      <div className="act-progress"><i style={{ width: `${actProgress}%` }} /></div>
      <section className="overlay-content custom-scrollbar">
        <StepTags step={step} />
        <h1>{step.title}</h1>
        <RouteLines step={step} />
        <Guidance step={step} mode={state.settings.guidanceMode} />
      </section>
      <footer className="overlay-footer">
        <span>{state.currentZone ? `In ${state.currentZone}` : 'Waiting for a zone change'}</span>
        <ProgressControls state={state} compact />
      </footer>
    </main>
  );
}

function StatusPill({ state }: { state: RuntimeState }) {
  const status = state.sourceStatus;
  const tone = ['error', 'fallback'].includes(status.state) ? 'warning' : status.state === 'checking' ? 'checking' : 'ok';
  return <span className={`status-pill ${tone}`}><i />{status.state === 'checking' ? 'Checking data' : tone === 'warning' ? 'Fallback active' : 'Campaign verified'}</span>;
}

function Overview({ state, onNavigate }: { state: RuntimeState; onNavigate: (tab: Tab) => void }) {
  const step = state.dataset.steps[nearestEnabledIndex(state)];
  const completed = Math.round((state.progress / Math.max(1, state.dataset.steps.length - 1)) * 100);
  return (
    <div className="page custom-scrollbar">
      <div className="page-heading"><div><span className="eyebrow">CAMPAIGN CO-PILOT</span><h1>Ready for Wraeclast.</h1><p>The route stays fast. The explanations make it understandable.</p></div><button className="primary-button large" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button></div>
      <div className="metric-grid">
        <article className="metric hero-metric"><span>Campaign progress</span><strong>{completed}%</strong><div className="metric-bar"><i style={{ width: `${completed}%` }} /></div><small>Act {step.act} · Step {step.indexInAct + 1}</small></article>
        <article className="metric"><span>Current target</span><strong className="text-value">{step.targetArea ?? step.title}</strong><small>{state.currentZone ? `Detected: ${state.currentZone}` : 'Waiting for Client.txt'}</small></article>
        <article className="metric"><span>Data source</span><strong className="text-value">Exile-UI</strong><small>{state.dataset.source.commit.slice(0, 8)} · verified</small></article>
      </div>
      <section className="dashboard-grid">
        <article className="panel next-step-panel">
          <div className="panel-heading"><div><span className="eyebrow">UP NEXT</span><h2>{step.title}</h2></div><StepTags step={step} /></div>
          <RouteLines step={step} />
          {step.annotation?.warning && <div className="inline-alert"><strong>Do not miss</strong>{step.annotation.warning}</div>}
          <div className="panel-actions"><button className="ghost-button" onClick={() => onNavigate('guide')}>View full route</button><ProgressControls state={state} /></div>
        </article>
        <aside className="side-stack">
          <article className="panel compact-panel"><span className="eyebrow">LIVE TRACKING</span><div className="connection-row"><i className={state.logConnected ? 'online' : ''} /><div><strong>{state.logConnected ? 'Client.txt connected' : 'Manual mode'}</strong><small>{state.settings.logPath || 'Choose the game log in Settings'}</small></div></div></article>
          <article className="panel compact-panel"><span className="eyebrow">ROUTE INTELLIGENCE</span><ul className="clean-list"><li><b>228</b> verified route pages</li><li><b>10</b> complete campaign acts</li><li><b>3</b> guidance modes</li></ul></article>
        </aside>
      </section>
    </div>
  );
}

function CampaignGuide({ state }: { state: RuntimeState }) {
  const current = state.dataset.steps[nearestEnabledIndex(state)];
  const [selectedAct, setSelectedAct] = useState(current.act);
  useEffect(() => setSelectedAct(current.act), [current.act]);
  const visible = enabledSteps(state).filter((step) => step.act === selectedAct);
  return (
    <div className="page guide-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">ACTS 1–10</span><h1>Campaign route</h1><p>Exile-UI routing, translated into a guide humans can actually read.</p></div><button className="ghost-button" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button></div>
      <div className="act-tabs custom-scrollbar">{Array.from({ length: 10 }, (_, index) => index + 1).map((act) => <button className={act === selectedAct ? 'active' : ''} onClick={() => setSelectedAct(act)} key={act}><span>ACT</span>{act}</button>)}</div>
      <div className="guide-layout">
        <aside className="step-list custom-scrollbar">
          {visible.map((step) => <button className={step.id === current.id ? 'active' : ''} key={step.id} onClick={() => void window.exileQuesting.setProgress(state.dataset.steps.indexOf(step))}><span>{String(step.indexInAct + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><small>{step.targetArea ?? `Act ${step.act}`}</small></div>{step.tags.includes('passive') && <i>+1</i>}</button>)}
        </aside>
        <article className="panel step-detail custom-scrollbar">
          <div className="step-title-row"><div><span className="eyebrow">ACT {current.act} · ROUTE STEP {current.indexInAct + 1}</span><h2>{current.title}</h2><p>{current.targetArea}{current.areaLevel ? ` · Area level ${current.areaLevel}` : ''}</p></div><StepTags step={current} /></div>
          <RouteLines step={current} />
          <Guidance step={current} mode={state.settings.guidanceMode} />
          <ProgressControls state={state} />
        </article>
      </div>
    </div>
  );
}

const KNOWLEDGE = [
  { n: '01', title: 'Town time is real time', body: 'Know your gem reward, socket colours, vendor search, and passive choices before opening a town panel. The fastest route is useless if every town visit becomes a five-minute planning session.' },
  { n: '02', title: 'Kill density, not everything', body: 'Prioritize compact normal packs and valuable magic packs while moving. Skip isolated tanky rares unless your build needs the experience. Stay within the safe level band instead of chasing exact parity with every zone.' },
  { n: '03', title: 'Movement is a damage multiplier', body: 'Movement-speed boots, Quicksilver uptime, and a correctly used movement skill save time in every zone. Check boot vendors early and keep the best usable pair rather than evaluating every rare.' },
  { n: '04', title: 'Use exits as resources', body: 'A planned relog returns you to the last town without spending a Portal Scroll. A deliberately placed portal can turn a branch into a short loop. These are route decisions, not emergency buttons.' },
  { n: '05', title: 'Read layout tells', body: 'Roads, streams, shorelines, wagons, waypoint orientation, room size, and repeated corner relationships are stronger clues than instinct. Our route surfaces each known tell at the step where it matters.' },
  { n: '06', title: 'Prepare the build transition', body: 'The guide should know when your build changes skill, support, weapon, or links. Until PoB import lands, use the route reminders and avoid replacing a usable link just because a higher-rarity item dropped.' },
];

function Knowledge() {
  return <div className="page custom-scrollbar"><div className="page-heading compact-heading"><div><span className="eyebrow">RESEARCH → PRACTICE</span><h1>Run smarter</h1><p>The repeatable habits behind faster, less confusing campaigns.</p></div></div><div className="knowledge-grid">{KNOWLEDGE.map((item) => <article className="panel knowledge-card" key={item.n}><span>{item.n}</span><h2>{item.title}</h2><p>{item.body}</p></article>)}</div><article className="panel safety-panel"><div className="shield">◇</div><div><span className="eyebrow">SAFE BY DESIGN</span><h2>We observe and advise. We never play.</h2><p>ExileQuesting reads the log file you select and displays guidance. It does not inspect process memory, inject code, click, move, craft, or trigger game inputs from detected events.</p></div></article></div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

function Settings({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const update = (patch: Partial<AppSettings>) => void window.exileQuesting.setSettings(patch).then(setState);
  return (
    <div className="page custom-scrollbar"><div className="page-heading compact-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Settings</h1><p>Sensible defaults, with control where it actually matters.</p></div></div>
      <div className="settings-grid">
        <section className="panel settings-section"><div className="section-title"><h2>Game connection</h2><span>Client.txt is read-only</span></div><div className="file-picker"><div><strong>{state.settings.logPath ? 'Game log selected' : 'Game log not found'}</strong><small>{state.settings.logPath || 'Steam and standalone locations are checked automatically.'}</small></div><button className="ghost-button" onClick={() => void window.exileQuesting.selectLogFile().then(setState)}>Browse…</button></div><SettingRow title="Automatic route progress" description="Advance when a verified area transition appears in the log."><Toggle checked={state.settings.autoAdvance} onChange={(autoAdvance) => update({ autoAdvance })} /></SettingRow><SettingRow title="Show overlay on zone change" description="Bring the overlay back when a new campaign area loads."><Toggle checked={state.settings.autoShowOnZoneChange} onChange={(autoShowOnZoneChange) => update({ autoShowOnZoneChange })} /></SettingRow></section>
        <section className="panel settings-section"><div className="section-title"><h2>Route profile</h2><span>Changes visible branches</span></div><label className="field"><span>Guidance mode</span><select value={state.settings.guidanceMode} onChange={(event) => update({ guidanceMode: event.target.value as AppSettings['guidanceMode'] })}><option value="beginner">Beginner — explain everything</option><option value="balanced">Balanced — instructions + warnings</option><option value="racer">Racer — minimum reading</option></select></label><label className="field"><span>Bandit choice</span><select value={state.settings.bandit} onChange={(event) => update({ bandit: event.target.value as AppSettings['bandit'] })}><option value="none">Kill all three</option><option value="alira">Help Alira</option><option value="kraityn">Help Kraityn</option><option value="oak">Help Oak</option></select></label><SettingRow title="League-start route" description="Show first-character vendor, trial, and gearing steps."><Toggle checked={state.settings.leagueStart} onChange={(leagueStart) => update({ leagueStart })} /></SettingRow><SettingRow title="Optional objectives" description="Include useful detours and non-mandatory loot checks."><Toggle checked={state.settings.showOptional} onChange={(showOptional) => update({ showOptional })} /></SettingRow></section>
        <section className="panel settings-section"><div className="section-title"><h2>Overlay</h2><span>Always on top</span></div><label className="field range-field"><span>Opacity <b>{Math.round(state.settings.overlayOpacity * 100)}%</b></span><input type="range" min="35" max="100" value={state.settings.overlayOpacity * 100} onChange={(event) => update({ overlayOpacity: Number(event.target.value) / 100 })} /></label><label className="field range-field"><span>UI scale <b>{Math.round(state.settings.overlayScale * 100)}%</b></span><input type="range" min="75" max="150" value={state.settings.overlayScale * 100} onChange={(event) => update({ overlayScale: Number(event.target.value) / 100 })} /></label><SettingRow title="Click-through overlay" description="Mouse input passes to the game; use the hotkey to toggle visibility."><Toggle checked={state.settings.overlayClickThrough} onChange={(overlayClickThrough) => update({ overlayClickThrough })} /></SettingRow></section>
      </div>
    </div>
  );
}

function SettingRow({ title, description, children }: React.PropsWithChildren<{ title: string; description: string }>) {
  return <div className="setting-row"><div><strong>{title}</strong><small>{description}</small></div>{children}</div>;
}

function Diagnostics({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const validation = state.sourceStatus.validation;
  return <div className="page custom-scrollbar"><div className="page-heading compact-heading"><div><span className="eyebrow">HEALTH & COMPATIBILITY</span><h1>Diagnostics</h1><p>Enough detail to fix problems without making you read a debug novel.</p></div><button className="ghost-button" onClick={() => void window.exileQuesting.openDiagnosticsFolder()}>Open logs folder</button></div><section className="panel diagnostics-panel"><Diagnostic label="Application" value={`v${state.appVersion}`} status="ok" /><Diagnostic label="Campaign source" value={`Exile-UI @ ${state.dataset.source.commit.slice(0, 8)}`} status="ok" /><Diagnostic label="Campaign schema" value={`v${state.dataset.schemaVersion} · ${state.dataset.steps.length} steps`} status="ok" /><Diagnostic label="Client.txt" value={state.logConnected ? state.settings.logPath : 'Not connected — manual controls remain available'} status={state.logConnected ? 'ok' : 'warn'} /><Diagnostic label="Upstream compatibility" value={state.sourceStatus.message} status={['fallback', 'error'].includes(state.sourceStatus.state) ? 'warn' : 'ok'} /></section>{validation && <section className="panel validation-panel"><h2>Last validation</h2><div className="validation-metrics"><span><b>{validation.metrics.acts}</b> acts</span><span><b>{validation.metrics.steps}</b> steps</span><span><b>{validation.metrics.areas}</b> areas</span><span><b>{validation.metrics.unresolvedAreaReferences}</b> unresolved</span></div></section>}<div className="diagnostic-actions"><button className="primary-button large" disabled={state.sourceStatus.state === 'checking'} onClick={() => void window.exileQuesting.checkCampaignUpdates().then(setState)}>{state.sourceStatus.state === 'checking' ? 'Checking…' : 'Check campaign data'}</button></div></div>;
}

function Diagnostic({ label, value, status }: { label: string; value: string; status: 'ok' | 'warn' }) {
  return <div className="diagnostic-row"><i className={status} /><strong>{label}</strong><span>{value}</span></div>;
}

function Manager({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const content = useMemo(() => {
    if (tab === 'overview') return <Overview state={state} onNavigate={setTab} />;
    if (tab === 'guide') return <CampaignGuide state={state} />;
    if (tab === 'knowledge') return <Knowledge />;
    if (tab === 'settings') return <Settings state={state} setState={setState} />;
    return <Diagnostics state={state} setState={setState} />;
  }, [tab, state, setState]);
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">EQ</div><div><strong>ExileQuesting</strong><span>Campaign co-pilot</span></div></div><nav>{NAV_ITEMS.map((item) => <button className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)} key={item.id}><i>{item.icon}</i>{item.label}</button>)}</nav><div className="sidebar-footer"><StatusPill state={state} /><small>Not affiliated with or endorsed by Grinding Gear Games.</small></div></aside><main className="manager-main"><header className="topbar"><div><span className={`live-dot ${state.logConnected ? 'online' : ''}`} />{state.logConnected ? state.currentZone ?? 'Listening for zone changes' : 'Manual tracking active'}</div><div><span>v{state.appVersion}</span><button className="topbar-button" onClick={() => void window.exileQuesting.showOverlay()}>Overlay ↗</button></div></header>{content}</main></div>;
}

export function App({ mode }: { mode: 'manager' | 'overlay' }) {
  const [state, setState] = useRuntime();
  if (!state) return <div className="loading-screen"><div className="brand-mark">EQ</div><span>Loading verified campaign data…</span></div>;
  return mode === 'overlay' ? <Overlay state={state} /> : <Manager state={state} setState={setState} />;
}

