import { useEffect, useMemo, useState } from 'react';
import BuildWorkspace from './BuildWorkspace';
import CampaignGuideV2 from './CampaignGuideV2';
import CommandPalette, { type AppTab } from './CommandPalette';
import {
  DetectionTracePanel,
  RecoveryBanner,
  RewardAuditPanel,
  RunDashboard,
  RunSettings,
  UpdatePanel,
} from './reliability';
import { campaignCompletionAudit, guideCalloutsForStep, passivePlanSummary } from '../core/guide-experience';
import { isStepEnabled } from '../core/campaign';
import { summarizeActions } from '../core/actions';
import type { BuildDoctorSnapshot } from '../core/build-doctor';
import type { AppSettings, OverlayMode, OverlayTypography, OverlayTypographyPreset, RuntimeState } from '../core/types';
import './manager-v2.css';

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'guide', label: 'Campaign', icon: '◇' },
  { id: 'build', label: 'Build', icon: '⬡' },
  { id: 'knowledge', label: 'Knowledge', icon: '✦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'diagnostics', label: 'Diagnostics', icon: '◌' },
];

const TYPOGRAPHY_PRESETS: Record<Exclude<OverlayTypographyPreset, 'custom'>, Omit<OverlayTypography, 'preset' | 'density'>> = {
  compact: { objective: 18, actions: 13, guidance: 11, labels: 9, status: 9 },
  default: { objective: 21, actions: 15, guidance: 13, labels: 10, status: 10 },
  large: { objective: 24, actions: 17, guidance: 15, labels: 11, status: 11 },
  'extra-large': { objective: 28, actions: 20, guidance: 17, labels: 13, status: 13 },
};

function nearestEnabledIndex(state: RuntimeState): number {
  let index = state.progress;
  while (index < state.dataset.steps.length) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
    index += 1;
  }
  return Math.max(0, Math.min(state.progress, state.dataset.steps.length - 1));
}

function nextEnabledIndex(state: RuntimeState, from: number): number | null {
  for (let index = from + 1; index < state.dataset.steps.length; index += 1) {
    if (isStepEnabled(state.dataset.steps[index], state.settings)) return index;
  }
  return null;
}

function StatusPill({ state }: { state: RuntimeState }) {
  const warning = ['error', 'fallback'].includes(state.sourceStatus.state);
  return <span className={`status-pill ${warning ? 'warning' : 'ok'}`}><i />{warning ? 'Fallback active' : 'Campaign verified'}</span>;
}

function StartupReconcile({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  if (state.startupReconciliation.state !== 'suggested') return null;
  return (
    <div className="modal-backdrop">
      <section className="modal-card reconciliation-card">
        <span className="eyebrow">RESUME CAMPAIGN</span>
        <h2>We found a different current zone.</h2>
        <p>Detected <strong>{state.startupReconciliation.detectedAreaName ?? state.startupReconciliation.detectedAreaId}</strong>, while your saved route remains on step {(state.startupReconciliation.savedProgress ?? 0) + 1}.</p>
        <p>Choose explicitly. Campaign Guide 2 never silently replaces your furthest saved route position.</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={() => void window.exileQuesting.reconcileStartup(false).then(setState)}>Keep saved progress</button>
          <button className="primary-button" onClick={() => void window.exileQuesting.reconcileStartup(true).then(setState)}>Resume from detected zone</button>
        </div>
      </section>
    </div>
  );
}

function BuildDoctorOverview({ state, onNavigate }: { state: RuntimeState; onNavigate: (tab: AppTab) => void }) {
  const [doctor, setDoctor] = useState<BuildDoctorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const profileId = state.buildCoach?.profileId;
  useEffect(() => {
    let cancelled = false;
    if (!profileId) { setDoctor(null); return; }
    setBusy(true);
    void window.exileQuesting.analyzeBuildDoctor(profileId)
      .then((result) => { if (!cancelled) setDoctor(result); })
      .catch(() => { if (!cancelled) setDoctor(null); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  const warnings = doctor?.findings.filter((finding) => finding.severity === 'warning') ?? [];
  return (
    <article className="panel m2-doctor-card">
      <div className="m2-card-label"><span>BUILD DOCTOR</span><em>{busy ? 'Checking…' : doctor?.status ?? (profileId ? 'Unavailable' : 'No build')}</em></div>
      {!profileId ? <><h3>Import a build to activate Build Doctor</h3><p>The Overview only surfaces Doctor evidence after a real PoB/Maxroll profile exists. It never invents a generic build score.</p></> : doctor?.status === 'ready' ? <>
        <h3>{warnings.length ? `${warnings.length} verified warning${warnings.length === 1 ? '' : 's'} to review` : 'Verified PoB baseline is healthy'}</h3>
        <p>{warnings[0]?.title ?? doctor.message}</p>
        <div className="m2-doctor-findings">{warnings.slice(0, 2).map((finding) => <span key={finding.code}><b>!</b>{finding.title}</span>)}</div>
      </> : <><h3>{doctor?.status === 'runtime-unavailable' ? 'Build Doctor runtime unavailable' : 'Build Doctor needs attention'}</h3><p>{doctor?.message ?? 'Open Build to run the full evidence-backed analysis.'}</p></>}
      <button className="ghost-button" onClick={() => onNavigate('build')}>{profileId ? 'Open full Build Doctor' : 'Open Build'}</button>
    </article>
  );
}

function Overview({ state, setState, onNavigate }: { state: RuntimeState; setState: (state: RuntimeState) => void; onNavigate: (tab: AppTab) => void }) {
  const index = nearestEnabledIndex(state);
  const step = state.dataset.steps[index];
  const actions = summarizeActions(step.actions);
  const callouts = guideCalloutsForStep(step);
  const passive = passivePlanSummary(state.buildCoach);
  const audit = campaignCompletionAudit(state.rewardAudit, state.buildCoach);
  const completed = Math.round((index / Math.max(1, state.dataset.steps.length - 1)) * 100);
  const nextIndex = nextEnabledIndex(state, index);
  const next = nextIndex === null ? undefined : state.dataset.steps[nextIndex];
  return (
    <div className="page custom-scrollbar m2-overview">
      <RecoveryBanner state={state} setState={setState} />
      <div className="page-heading"><div><span className="eyebrow">LIVE COMPANION</span><h1>{state.currentZone ?? 'Ready for Wraeclast.'}</h1><p>Campaign route, permanent rewards and build decisions in one place.</p></div><div className="m2-heading-actions"><button className="ghost-button" onClick={() => onNavigate('guide')}>Campaign Guide</button><button className="primary-button large" onClick={() => void window.exileQuesting.showOverlay()}>Open overlay ↗</button></div></div>

      <div className="metric-grid run-metrics">
        <article className="metric hero-metric"><span>Campaign progress</span><strong>{completed}%</strong><div className="metric-bar"><i style={{ width: `${completed}%` }} /></div><small>Act {step.act} · Step {step.indexInAct + 1}</small></article>
        <article className="metric"><span>NOW</span><strong className="text-value">{actions.now?.title ?? step.title}</strong><small>{step.targetArea ?? state.currentZone ?? 'Route objective'}</small></article>
        <article className={`metric xp-metric xp-${state.xpGuidance.pace}`}><span>Level pacing</span><strong className="text-value">{state.xpGuidance.pace === 'unknown' ? 'Waiting for data' : state.xpGuidance.pace === 'efficient' ? 'XP good' : state.xpGuidance.pace}</strong><small>{state.characterLevel ? `You ${state.characterLevel}` : 'You ?'} · {state.currentAreaLevel ? `Area ${state.currentAreaLevel}` : 'Area ?'}</small></article>
      </div>

      {callouts.length > 0 && <section className="m2-now-alerts">{callouts.slice(0, 4).map((callout) => <article key={callout.id} className={`importance-${callout.importance}`}><b>{callout.kind === 'passive' ? '+1' : callout.kind === 'trial' ? '△' : callout.kind === 'labyrinth' ? '♜' : callout.kind === 'waypoint' ? '◈' : '!'}</b><div><span>{callout.kind.toUpperCase()}</span><strong>{callout.title}</strong><small>{callout.detail}</small></div></article>)}</section>}

      <section className="m2-primary-grid">
        <article className="panel m2-route-card"><div className="m2-card-label"><span>ROUTE</span><em>{step.targetArea ?? `Act ${step.act}`}</em></div><h2>{actions.now?.title ?? step.title}</h2>{actions.then.filter((action) => action.type !== 'build').slice(0, 4).map((action) => <div className="m2-mini-action" key={action.id}><i>→</i><span>{action.title}</span></div>)}{step.annotation?.warning && <div className="inline-alert"><strong>Don't miss</strong>{step.annotation.warning}</div>}{next && <div className="m2-next"><span>NEXT</span><strong>{summarizeActions(next.actions).now?.title ?? next.title}</strong></div>}<footer><button className="ghost-button" onClick={() => onNavigate('guide')}>Open full route</button><button className="primary-button" disabled={nextIndex === null} onClick={() => nextIndex !== null && void window.exileQuesting.setProgress(nextIndex).then(setState)}>{nextIndex === null ? 'Campaign complete' : 'Complete step →'}</button></footer></article>

        <aside className="m2-side-stack">
          <article className={`panel m2-passive-card state-${passive.state}`}><div className="m2-card-label"><span>PASSIVE PLAN</span><em>Replaces tree HUD</em></div><h3>{passive.title}</h3><p>{passive.detail}</p>{passive.total !== undefined && <div className="m2-progress"><i style={{ width: `${Math.round(((passive.completed ?? 0) / Math.max(1, passive.total)) * 100)}%` }} /></div>}<button className="ghost-button" onClick={() => onNavigate('guide')}>View Passive Plan</button></article>
          <article className={`panel m2-audit-card audit-${audit.state}`}><div className="m2-card-label"><span>CAMPAIGN AUDIT</span><em>{audit.state === 'ready' ? 'Clear' : 'Needs attention'}</em></div><h3>{state.rewardAudit.passive.confirmed}/{state.rewardAudit.passive.knownTotal} passives · {state.rewardAudit.trials.confirmed}/{state.rewardAudit.trials.knownTotal} trials</h3><p>{audit.headline}</p><button className="ghost-button" onClick={() => onNavigate('guide')}>Open audit</button></article>
        </aside>
      </section>

      <section className="m2-secondary-grid"><BuildDoctorOverview state={state} onNavigate={onNavigate} /><RunDashboard state={state} setState={setState} /><RewardAuditPanel state={state} setState={setState} compact /></section>
    </div>
  );
}

function applyExperiencePreset(setState: (state: RuntimeState) => void, preset: 'minimal' | 'standard' | 'teach'): void {
  const typography: Record<typeof preset, OverlayTypography> = {
    minimal: { preset: 'compact', objective: 18, actions: 13, guidance: 11, labels: 9, status: 9, density: 'compact' },
    standard: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
    teach: { preset: 'large', objective: 24, actions: 17, guidance: 15, labels: 11, status: 11, density: 'comfortable' },
  };
  const patch: Partial<AppSettings> = preset === 'minimal'
    ? { guidanceMode: 'racer', overlayMode: 'compact', overlayTypography: typography.minimal }
    : preset === 'teach'
      ? { guidanceMode: 'beginner', overlayMode: 'coach', overlayTypography: typography.teach }
      : { guidanceMode: 'balanced', overlayMode: 'focus', overlayTypography: typography.standard };
  void window.exileQuesting.setSettings(patch).then(setState);
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
  return <div className="page custom-scrollbar m2-settings"><div className="page-heading compact-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Settings</h1><p>Three useful presets first. Fine-grained controls stay in Advanced.</p></div></div>
    <section className="panel m2-presets"><div className="section-title"><h2>Experience preset</h2><span>Recommended: Standard</span></div><div className="m2-preset-grid"><button onClick={() => applyExperiencePreset(setState, 'minimal')}><strong>Minimal</strong><span>Experienced players · terse route · compact overlay</span></button><button className="recommended" onClick={() => applyExperiencePreset(setState, 'standard')}><strong>Standard</strong><span>Important context · Focus overlay · sane defaults</span></button><button onClick={() => applyExperiencePreset(setState, 'teach')}><strong>Teach Me</strong><span>Why, layout help and expanded coaching</span></button></div></section>
    <div className="settings-grid">
      <section className="panel settings-section"><div className="section-title"><h2>Game connection</h2><span>Client.txt is read-only</span></div><div className="file-picker"><div><strong>{state.logConnected ? 'Path of Exile connected' : state.settings.logPath ? 'Game log selected' : 'Game log not found'}</strong><small>{state.settings.logPath || 'Common installations are checked automatically.'}</small></div><button className="ghost-button" onClick={() => void window.exileQuesting.selectLogFile().then(setState)}>Browse…</button></div><SettingRow title="Automatic route progress" description="Advance only from verified or bounded inferred area transitions."><Toggle checked={state.settings.autoAdvance} onChange={(autoAdvance) => update({ autoAdvance })} /></SettingRow><SettingRow title="Show overlay on zone change" description="Show the campaign HUD after entering a new area."><Toggle checked={state.settings.autoShowOnZoneChange} onChange={(autoShowOnZoneChange) => update({ autoShowOnZoneChange })} /></SettingRow></section>
      <section className="panel settings-section"><div className="section-title"><h2>Campaign route</h2><span>What the guide includes</span></div><label className="field"><span>Bandit choice</span><select value={state.settings.bandit} onChange={(event) => update({ bandit: event.target.value as AppSettings['bandit'] })}><option value="none">Kill all three</option><option value="alira">Help Alira</option><option value="kraityn">Help Kraityn</option><option value="oak">Help Oak</option></select></label><SettingRow title="League-start route" description="Include first-character vendor, trial and gearing steps."><Toggle checked={state.settings.leagueStart} onChange={(leagueStart) => update({ leagueStart })} /></SettingRow><SettingRow title="Optional objectives" description="Include useful non-mandatory detours."><Toggle checked={state.settings.showOptional} onChange={(showOptional) => update({ showOptional })} /></SettingRow></section>
      <RunSettings state={state} update={update} /><UpdatePanel state={state} setState={setState} />
    </div>
    <details className="panel m2-advanced"><summary>Advanced overlay & accessibility</summary><div className="m2-advanced-grid">
      <label className="field"><span>Overlay mode</span><select value={state.settings.overlayMode} onChange={(event) => update({ overlayMode: event.target.value as OverlayMode })}><option value="compact">Compact</option><option value="focus">Focus</option><option value="coach">Coach</option></select></label>
      <label className="field"><span>Guidance depth</span><select value={state.settings.guidanceMode} onChange={(event) => update({ guidanceMode: event.target.value as AppSettings['guidanceMode'] })}><option value="racer">Racer</option><option value="balanced">Balanced</option><option value="beginner">Beginner</option></select></label>
      <SliderField label="Overall UI scale" value={Math.round(state.settings.overlayScale * 100)} min={75} max={150} suffix="%" onChange={(value) => update({ overlayScale: value / 100 })} />
      <SliderField label="Opacity" value={Math.round(state.settings.overlayOpacity * 100)} min={35} max={100} suffix="%" onChange={(value) => update({ overlayOpacity: value / 100 })} />
      <label className="field"><span>Typography preset</span><select value={typography.preset} onChange={(event) => event.target.value === 'custom' ? undefined : applyTypographyPreset(event.target.value as Exclude<OverlayTypographyPreset, 'custom'>)}><option value="compact">Compact</option><option value="default">Default</option><option value="large">Large</option><option value="extra-large">Extra large</option>{typography.preset === 'custom' && <option value="custom">Custom</option>}</select></label>
      <label className="field"><span>Overlay position</span><select value={state.settings.overlayPosition.preset} onChange={(event) => update({ overlayPosition: { ...state.settings.overlayPosition, preset: event.target.value as AppSettings['overlayPosition']['preset'] } })}><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option><option value="middle-left">Middle left</option><option value="middle-right">Middle right</option><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="custom">Custom</option></select></label>
      <SliderField label="Main objective" value={typography.objective} min={16} max={34} suffix="px" onChange={(objective) => setTypography({ objective })} />
      <SliderField label="Actions" value={typography.actions} min={11} max={24} suffix="px" onChange={(actions) => setTypography({ actions })} />
      <SliderField label="Guidance" value={typography.guidance} min={10} max={21} suffix="px" onChange={(guidance) => setTypography({ guidance })} />
      <SliderField label="Labels" value={typography.labels} min={9} max={16} suffix="px" onChange={(labels) => setTypography({ labels })} />
      <SliderField label="Status/footer" value={typography.status} min={9} max={16} suffix="px" onChange={(status) => setTypography({ status })} />
      <label className="field"><span>Line spacing</span><select value={typography.density} onChange={(event) => setTypography({ density: event.target.value as OverlayTypography['density'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
      <SettingRow title="Click-through overlay" description={`Toggle interaction with ${state.settings.hotkeys.toggleInteraction}.`}><Toggle checked={state.settings.overlayClickThrough} onChange={(overlayClickThrough) => update({ overlayClickThrough })} /></SettingRow>
      <SettingRow title="Lock overlay position" description="Prevent accidental movement after placement."><Toggle checked={state.settings.overlayPosition.locked} onChange={(locked) => update({ overlayPosition: { ...state.settings.overlayPosition, locked } })} /></SettingRow>
      <SettingRow title="Reduced motion" description="Disable non-essential transitions."><Toggle checked={state.settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} /></SettingRow>
      <SettingRow title="Reduced transparency" description="Use a fully opaque overlay surface."><Toggle checked={state.settings.reducedTransparency} onChange={(reducedTransparency) => update({ reducedTransparency })} /></SettingRow>
      <div className="setting-actions"><button className="ghost-button" onClick={() => void window.exileQuesting.showOverlay()}>Test overlay</button><button className="ghost-button" onClick={() => void window.exileQuesting.resetOverlayPosition().then(setState)}>Reset position</button></div>
    </div></details>
  </div>;
}

const KNOWLEDGE = [
  ['Permanent means permanent', 'Passive skill point quests and Ascendancy Trials are critical even when the story can continue without them. Guide 2 marks them before you leave the area.'],
  ['Trials are not Labyrinth runs', 'A Trial of Ascendancy unlocks Labyrinth access. A Labyrinth run awards Ascendancy points. ExileQuesting now models these as separate instructions.'],
  ['Build and campaign are one timeline', 'Gem rewards, vendor purchases, links, passive milestones and route objectives should appear at the moment the campaign makes them available.'],
  ['Layout clues are probabilistic', 'Roads, shorelines, room relationships and waypoint orientation can save time, but the guide labels them as clues instead of pretending a generated zone is deterministic.'],
  ['Recovery should not destroy progress', 'When you revisit an old zone or get ahead of the saved route, ExileQuesting shows local help without silently moving your furthest campaign state.'],
  ['Evidence beats a magic score', 'Build Doctor keeps deterministic PoB evidence separate from uncertain advice. Unknown mechanics stay unknown until we can prove them.'],
];

function Knowledge() {
  return <div className="page custom-scrollbar"><div className="page-heading compact-heading"><div><span className="eyebrow">GUIDE PRINCIPLES</span><h1>How ExileQuesting thinks</h1><p>Useful rules rather than a wall of Path of Exile trivia.</p></div></div><div className="knowledge-grid">{KNOWLEDGE.map(([title, body], index) => <article className="panel knowledge-card" key={title}><span>{String(index + 1).padStart(2, '0')}</span><h2>{title}</h2><p>{body}</p></article>)}</div></div>;
}

function Diagnostics({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const step = state.dataset.steps[state.progress];
  const lastHistory = [...state.progressHistory].reverse().slice(0, 5);
  return <div className="page custom-scrollbar diagnostics-page"><div className="page-heading compact-heading"><div><span className="eyebrow">HEALTH & COMPATIBILITY</span><h1>Diagnostics</h1><p>Only operational state that helps explain a problem.</p></div><div className="heading-actions"><button className="ghost-button" onClick={() => void window.exileQuesting.copyDiagnostics()}>Copy diagnostics</button><button className="ghost-button" onClick={() => void window.exileQuesting.exportDiagnostics()}>Export report</button><button className="ghost-button" onClick={() => void window.exileQuesting.openDiagnosticsFolder()}>Open logs</button></div></div><div className="diagnostic-grid"><section className="panel diagnostic-card"><div className="section-title"><h2>Client tracking</h2><span>{state.logConnected ? 'Healthy' : 'Needs attention'}</span></div><dl className="diagnostic-list"><dt>Path</dt><dd>{state.logDiagnostics.path || 'Not configured'}</dd><dt>Watcher</dt><dd>{state.logDiagnostics.watcherActive ? 'Active' : 'Inactive'}</dd><dt>Polling fallback</dt><dd>{state.logDiagnostics.pollingActive ? 'Active' : 'Inactive'}</dd><dt>Current area</dt><dd>{state.currentZone ?? 'Unknown'}</dd><dt>Character / area</dt><dd>{state.characterLevel ?? '?'} / {state.currentAreaLevel ?? '?'}</dd></dl></section><section className="panel diagnostic-card"><div className="section-title"><h2>Route state</h2><span>{state.progress + 1}/{state.dataset.steps.length}</span></div><dl className="diagnostic-list"><dt>Objective</dt><dd>{summarizeActions(step.actions).now?.title ?? step.title}</dd><dt>XP state</dt><dd>{state.xpGuidance.pace}</dd><dt>Passives confirmed</dt><dd>{state.rewardAudit.passive.confirmed}/{state.rewardAudit.passive.knownTotal}</dd><dt>Trials confirmed</dt><dd>{state.rewardAudit.trials.confirmed}/{state.rewardAudit.trials.knownTotal}</dd></dl><div className="history-list">{lastHistory.map((entry) => <div key={entry.id}><span>{new Date(entry.at).toLocaleTimeString()}</span><strong>{entry.from + 1} → {entry.to + 1}</strong><small>{entry.confidence} · {entry.reason}</small></div>)}</div><button className="ghost-button" disabled={!state.progressHistory.length} onClick={() => void window.exileQuesting.undoProgress().then(setState)}>Undo last progress change</button></section><section className="panel diagnostic-card wide-diagnostic"><div className="section-title"><h2>Application & campaign data</h2><span>{state.sourceStatus.state}</span></div><div className="diagnostic-summary"><div><span>Application</span><strong>v{state.appVersion}</strong></div><div><span>Campaign source</span><strong>{state.dataset.source.repository}</strong><small>{state.dataset.source.commit.slice(0, 12)}</small></div><div><span>Schema</span><strong>v{state.dataset.schemaVersion}</strong></div></div><p className="source-message">{state.sourceStatus.message}</p></section><DetectionTracePanel state={state} /><div className="wide-diagnostic"><RewardAuditPanel state={state} setState={setState} /></div></div></div>;
}

function Onboarding({ setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  return <div className="modal-backdrop onboarding-backdrop"><section className="onboarding-card"><div className="onboarding-page"><span className="eyebrow">WELCOME</span><h1>Your Path of Exile co-pilot.</h1><p>Campaign Guide 2 combines route instructions, permanent rewards, build milestones and recovery without reading process memory or playing for you.</p><div className="m2-preset-grid"><button onClick={() => applyExperiencePreset(setState, 'minimal')}><strong>Minimal</strong><span>I know PoE. Keep it fast.</span></button><button className="recommended" onClick={() => applyExperiencePreset(setState, 'standard')}><strong>Standard</strong><span>Recommended balance.</span></button><button onClick={() => applyExperiencePreset(setState, 'teach')}><strong>Teach Me</strong><span>Explain what matters and why.</span></button></div><button className="primary-button large" onClick={() => void window.exileQuesting.setSettings({ onboardingComplete: true }).then(setState)}>Start ExileQuesting</button></div></section></div>;
}

export default function ManagerV2() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [tab, setTab] = useState<AppTab>('overview');
  useEffect(() => {
    void window.exileQuesting.bootstrap().then(setState);
    return window.exileQuesting.onState(setState);
  }, []);
  const updateReady = state ? ['available', 'ready'].includes(state.appUpdate.status) : false;
  const step = useMemo(() => state ? state.dataset.steps[nearestEnabledIndex(state)] : undefined, [state]);
  if (!state || !step) return <div className="loading-screen"><div className="brand-mark">EQ</div><span>Loading verified campaign data…</span></div>;
  return <div className="app-shell m2-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">EQ</div><div><strong>ExileQuesting</strong><span>PoE co-pilot</span></div></div><nav>{NAV_ITEMS.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><i>{item.icon}</i>{item.label}{item.id === 'settings' && updateReady && <b className="nav-badge">1</b>}</button>)}</nav><div className="m2-search-hint"><kbd>Ctrl</kbd><kbd>K</kbd><span>Search</span></div><div className="sidebar-footer"><StatusPill state={state} /><small>Not affiliated with or endorsed by Grinding Gear Games.</small></div></aside><section className="manager-main"><header className="topbar"><div><i className={`live-dot ${state.logConnected ? 'online' : ''}`} /><span>{state.logConnected ? `Tracking ${state.currentZone ?? 'zone changes'}` : 'Manual campaign tracking'}</span></div><div>{updateReady && <button className="topbar-update" onClick={() => setTab('settings')}>Update {state.appUpdate.latestVersion}</button>}<span>Act {step.act}</span><span>v{state.appVersion}</span><button className="topbar-button" onClick={() => void window.exileQuesting.showOverlay()}>Overlay ↗</button></div></header>{tab === 'overview' && <Overview state={state} setState={setState} onNavigate={setTab} />}{tab === 'guide' && <CampaignGuideV2 state={state} setState={setState} />}{tab === 'build' && <BuildWorkspace />}{tab === 'knowledge' && <Knowledge />}{tab === 'settings' && <Settings state={state} setState={setState} />}{tab === 'diagnostics' && <Diagnostics state={state} setState={setState} />}</section><CommandPalette state={state} onNavigate={setTab} />{!state.settings.onboardingComplete && <Onboarding state={state} setState={setState} />}<StartupReconcile state={state} setState={setState} /></div>;
}
