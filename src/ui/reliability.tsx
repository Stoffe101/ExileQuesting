import { useEffect, useMemo, useState } from 'react';
import { elapsedRunMs, formatDuration, isTownAreaId } from '../core/run';
import type { AppSettings, RuntimeState } from '../core/types';
import PassivesAuditPanel from './PassivesAuditPanel';

function useNow(enabled = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

export function liveElapsed(state: RuntimeState, now = Date.now()): number {
  return elapsedRunMs(state.runStats.session, now);
}

function liveTownTime(state: RuntimeState, now: number): number {
  const session = state.runStats.session;
  if (session.state !== 'running' || !isTownAreaId(session.lastAreaId) || !session.lastZoneChangedAt) return session.townTimeMs;
  const entered = Date.parse(session.lastZoneChangedAt);
  return session.townTimeMs + (Number.isFinite(entered) ? Math.max(0, now - entered) : 0);
}

export function OverlayRunClock({ state }: { state: RuntimeState }) {
  const active = state.runStats.session.state === 'running' || state.runStats.session.state === 'paused';
  const now = useNow(active);
  if (!state.settings.showRunTimerInOverlay || !active) return null;
  return <span className="overlay-run-clock">RUN {formatDuration(liveElapsed(state, now))}</span>;
}

export function RecoveryBanner({ state, setState }: { state: RuntimeState; setState: (next: RuntimeState) => void }) {
  if (!state.recovery.previousSessionUnclean || state.recovery.acknowledged) return null;
  return (
    <div className="recovery-banner">
      <div><span>RECOVERY</span><strong>ExileQuesting did not shut down cleanly last time.</strong><p>Your saved route data is intact. Review Diagnostics if anything looks wrong.</p></div>
      <button className="ghost-button" onClick={() => void window.exileQuesting.acknowledgeRecovery().then(setState)}>Got it</button>
    </div>
  );
}

export function RunDashboard({ state, setState }: { state: RuntimeState; setState: (next: RuntimeState) => void }) {
  const session = state.runStats.session;
  const active = session.state === 'running' || session.state === 'paused';
  const now = useNow(active);
  const elapsed = liveElapsed(state, now);
  const town = liveTownTime(state, now);
  const previous = state.runStats.previous;
  const pb = state.runStats.personalBest;

  return (
    <article className="panel run-dashboard-panel">
      <div className="section-title"><h2>Campaign run</h2><span>{session.state}</span></div>
      <div className="run-clock-row">
        <div><span>RUN TIME</span><strong>{formatDuration(elapsed)}</strong></div>
        <div><span>TOWN TIME</span><strong>{formatDuration(town)}</strong></div>
        <div><span>ACT</span><strong>{session.currentAct ?? state.dataset.steps[state.progress]?.act ?? 1}</strong></div>
      </div>
      <div className="run-reference-row">
        <span>Previous <b>{previous ? formatDuration(previous.totalMs) : '—'}</b></span>
        <span>Personal best <b>{pb ? formatDuration(pb.totalMs) : '—'}</b></span>
      </div>
      {session.splits.length > 0 && <div className="split-strip">{session.splits.map((split) => <span key={split.act}><i>A{split.act}</i>{formatDuration(split.elapsedMs)}</span>)}</div>}
      <div className="run-actions">
        {session.state === 'idle' || session.state === 'finished'
          ? <button className="primary-button" onClick={() => void window.exileQuesting.startRun().then(setState)}>Start run</button>
          : session.state === 'running'
            ? <button className="ghost-button" onClick={() => void window.exileQuesting.pauseRun().then(setState)}>Pause</button>
            : <button className="primary-button" onClick={() => void window.exileQuesting.startRun().then(setState)}>Resume</button>}
        {active && <button className="ghost-button" onClick={() => void window.exileQuesting.finishRun().then(setState)}>Finish run</button>}
        <button className="ghost-button" onClick={() => void window.exileQuesting.resetRun().then(setState)}>Reset</button>
      </div>
    </article>
  );
}

export function UpdatePanel({ state, setState }: { state: RuntimeState; setState: (next: RuntimeState) => void }) {
  const update = state.appUpdate;
  const working = update.status === 'checking' || update.status === 'downloading';
  return (
    <section className="panel settings-section wide-section update-panel">
      <div className="section-title"><h2>Application updates</h2><span>Installed app · v{state.appVersion}</span></div>
      <div className={`update-status update-${update.status}`}>
        <div><span>{update.status.replaceAll('-', ' ').toUpperCase()}</span><strong>{update.latestVersion && update.latestVersion !== state.appVersion ? `ExileQuesting ${update.latestVersion}` : update.message}</strong>{update.latestVersion && update.latestVersion !== state.appVersion && <p>{update.message}</p>}</div>
        <div className="update-buttons">
          <button className="ghost-button" disabled={working} onClick={() => void window.exileQuesting.checkAppUpdates().then(setState)}>{update.status === 'checking' ? 'Checking…' : 'Check now'}</button>
          {update.status === 'available' && <button className="primary-button" onClick={() => void window.exileQuesting.downloadAppUpdate().then(setState)}>Download update</button>}
          {update.status === 'ready' && <button className="primary-button" onClick={() => void window.exileQuesting.installAppUpdate()}>Restart & install</button>}
        </div>
      </div>
      {update.status === 'downloading' && <div className="update-progress"><i style={{ width: `${update.progress ?? 0}%` }} /><span>{update.progress ?? 0}%{update.totalBytes ? ` · ${Math.round((update.downloadedBytes ?? 0) / 1024 / 1024)} / ${Math.round(update.totalBytes / 1024 / 1024)} MB` : ''}</span></div>}
      {update.releaseNotes && ['available', 'ready'].includes(update.status) && <details className="release-notes"><summary>What's new</summary><p>{update.releaseNotes}</p></details>}
      <SettingToggle title="Automatically check for updates" description="Check the stable GitHub release feed quietly in the background." checked={state.settings.autoCheckAppUpdates} onChange={(autoCheckAppUpdates) => void window.exileQuesting.setSettings({ autoCheckAppUpdates }).then(setState)} />
      <SettingToggle title="Automatically download updates" description="Download verified setup files in the background, but never install until you choose to restart." checked={state.settings.autoDownloadAppUpdates} onChange={(autoDownloadAppUpdates) => void window.exileQuesting.setSettings({ autoDownloadAppUpdates }).then(setState)} />
    </section>
  );
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="setting-row"><div><strong>{title}</strong><small>{description}</small></div><button className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} role="switch" aria-checked={checked}><i /></button></div>;
}

export function RunSettings({ state, update }: { state: RuntimeState; update: (patch: Partial<AppSettings>) => void }) {
  return (
    <section className="panel settings-section">
      <div className="section-title"><h2>Run tracking</h2><span>Local only</span></div>
      <SettingToggle title="Auto-start campaign timer" description="Start timing when a fresh campaign begins producing zone events." checked={state.settings.autoStartRunTimer} onChange={(autoStartRunTimer) => update({ autoStartRunTimer })} />
      <SettingToggle title="Show timer in overlay" description="Display a small run clock without competing with NOW/NEXT guidance." checked={state.settings.showRunTimerInOverlay} onChange={(showRunTimerInOverlay) => update({ showRunTimerInOverlay })} />
    </section>
  );
}

export function RewardAuditPanel({ state, setState, compact = false }: { state: RuntimeState; setState: (next: RuntimeState) => void; compact?: boolean }) {
  const audit = state.rewardAudit;
  const important = useMemo(() => audit.items.filter((item) => item.status !== 'confirmed'), [audit.items]);
  const visible = compact ? important.slice(0, 5) : audit.items;
  return (
    <article className={`panel reward-audit-panel ${compact ? 'compact-audit' : ''}`}>
      <div className="section-title"><h2>Permanent rewards audit</h2><span>{audit.passive.confirmed + audit.trials.confirmed}/{audit.passive.knownTotal + audit.trials.knownTotal} manually confirmed</span></div>
      <div className="audit-summary">
        <div><strong>{audit.passive.confirmed}</strong><span>Passives confirmed</span><small>{audit.passive.routePassed}/{audit.passive.knownTotal} route-passed</small></div>
        <div><strong>{audit.trials.confirmed}</strong><span>Trials confirmed</span><small>{audit.trials.routePassed}/{audit.trials.knownTotal} route-passed</small></div>
      </div>
      <PassivesAuditPanel state={state} compact={compact} />
      {!compact && <p className="panel-copy">The route checklist below remains a manual campaign record. The /passives reconciliation above is the authoritative check for passive quest rewards actually credited by Path of Exile.</p>}
      <div className="audit-list">
        {visible.length ? visible.map((item) => <div className={`audit-item audit-${item.status}`} key={item.stepId}><span>{item.type === 'passive' ? '+1' : '△'}</span><div><strong>{item.label}</strong><small>Act {item.act} · {item.status === 'route-passed' ? 'Route passed, not yet confirmed' : item.status}</small></div><button className={item.status === 'confirmed' ? 'ghost-button tiny' : 'primary-button tiny'} onClick={() => void window.exileQuesting.confirmReward(item.stepId, item.status !== 'confirmed').then(setState)}>{item.status === 'confirmed' ? 'Unconfirm' : 'Confirm'}</button></div>) : <p className="empty-copy">Everything in the current route audit is manually confirmed.</p>}
      </div>
      {compact && important.length > visible.length && <small className="more-copy">+{important.length - visible.length} more route-audit items in Diagnostics/Campaign.</small>}
    </article>
  );
}

export function DetectionTracePanel({ state }: { state: RuntimeState }) {
  const trace = [...state.detectionTrace].reverse().slice(0, 12);
  return (
    <section className="panel diagnostic-card wide-diagnostic trace-panel">
      <div className="section-title"><h2>Detection trace</h2><span>Newest first</span></div>
      <p className="panel-copy">Shows the exact path from Client.txt event to campaign decision. This is the first place to look when automatic progress feels wrong.</p>
      <div className="trace-list">
        {trace.length ? trace.map((entry) => <div className="trace-entry" key={entry.id}><span>{new Date(entry.at).toLocaleTimeString()}</span><div><strong>{entry.eventType} · {entry.areaName ?? entry.areaId ?? 'no area'}</strong><small>Step {entry.progressBefore + 1} → {entry.progressAfter + 1}{entry.confidence ? ` · ${entry.confidence}` : ''}</small><p>{entry.reason}</p></div></div>) : <p className="empty-copy">No Client.txt events have been parsed this session.</p>}
      </div>
    </section>
  );
}
