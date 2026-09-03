import { useEffect, useMemo, useState } from 'react';
import type { BuildDoctorSnapshot } from '../core/build-doctor';
import BuildDoctorCandidateItemPanel from './BuildDoctorCandidateItemPanel';
import BuildDoctorDependencyPanel from './BuildDoctorDependencyPanel';
import BuildDoctorPassiveContributionPanel from './BuildDoctorPassiveContributionPanel';

type BuildWorkspaceState = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

function compactNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function percent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1).replace(/\.0$/, '')}%`;
}

function statusLabel(snapshot: BuildDoctorSnapshot | null, busy: boolean): string {
  if (busy) return 'calculating';
  if (!snapshot) return 'not run';
  if (snapshot.status === 'ready') return snapshot.integrity?.status === 'attention-required' ? 'attention required' : 'verified baseline';
  if (snapshot.status === 'reimport-required') return 're-import needed';
  if (snapshot.status === 'runtime-unavailable') return 'runtime unavailable';
  if (snapshot.status === 'calculation-input-invalid') return 'input rejected';
  return 'calculation failed';
}

export default function BuildDoctorPanel({ workspace }: { workspace: BuildWorkspaceState }) {
  const active = workspace.planner.profiles.find((entry) => entry.profile.id === workspace.planner.activeProfileId);
  const profile = active?.profile;
  const [snapshot, setSnapshot] = useState<BuildDoctorSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSnapshot(null);
    setError('');
  }, [profile?.id]);

  const run = async () => {
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    try {
      setSnapshot(await window.exileQuesting.analyzeBuildDoctor(profile.id));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  const baseline = snapshot?.status === 'ready' ? snapshot.baseline : undefined;
  const damage = baseline?.offence.totalDps ?? baseline?.offence.combinedDps ?? baseline?.offence.hitDps ?? baseline?.offence.dotDps;
  const maxHits = baseline?.defence.maximumHit;
  const utilityRows = snapshot?.status === 'ready' ? snapshot.flaskInspection?.flasks ?? [] : [];
  const activeUtilities = useMemo(() => utilityRows.filter((entry) => entry.active).length, [utilityRows]);
  const activeUtilityDependencies = useMemo(() => utilityRows.filter((entry) => entry.active && entry.utility).length, [utilityRows]);
  const integrity = snapshot?.status === 'ready' ? snapshot.integrity : undefined;

  return (
    <section className="panel build-doctor-panel" data-testid="build-doctor-panel">
      <div className="build-doctor-heading">
        <div>
          <span className="eyebrow">ENDGAME BUILD INTELLIGENCE · v0.3</span>
          <h2>Build Doctor</h2>
          <p>Calculate the imported build with the pinned Path of Building kernel, preserve what is actually proven, and surface configuration caveats before recommendations.</p>
        </div>
        <div className="build-doctor-run">
          <span className={`status-pill ${snapshot?.status === 'ready' && integrity?.status !== 'attention-required' ? 'ok' : snapshot ? 'warning' : ''}`}>
            <i />{statusLabel(snapshot, busy)}
          </span>
          <button className="primary-button" disabled={!profile || busy} onClick={() => void run()}>
            {busy ? 'Calculating in PoB…' : snapshot?.status === 'ready' ? 'Recalculate' : 'Run Build Doctor'}
          </button>
        </div>
      </div>

      {!profile && <p className="build-empty">Select or import a Path of Building profile before running Build Doctor.</p>}
      {profile && !profile.calculation && !snapshot && (
        <div className="inline-alert">
          <strong>One-time re-import required</strong>
          This profile was saved before Build Doctor began preserving verified calculation inputs. Re-import the PoB once; ExileQuesting will keep the canonical XML locally with SHA-256 provenance.
        </div>
      )}
      {error && <div className="inline-alert"><strong>Build Doctor</strong>{error}</div>}
      {snapshot && snapshot.status !== 'ready' && (
        <div className="inline-alert"><strong>{statusLabel(snapshot, false)}</strong>{snapshot.message}</div>
      )}

      {snapshot?.status === 'ready' && baseline && (
        <>
          <div className="build-doctor-metrics" data-testid="build-doctor-metrics">
            <article><span>PoB damage</span><strong>{compactNumber(damage)}</strong><small>imported state</small></article>
            <article><span>Effective hit pool</span><strong>{compactNumber(baseline.defence.effectiveHitPool)}</strong><small>PoB output</small></article>
            <article><span>Life / ES</span><strong>{compactNumber(baseline.defence.life)} / {compactNumber(baseline.defence.energyShield)}</strong><small>resources</small></article>
            <article><span>Crit chance</span><strong>{percent(baseline.offence.critChance)}</strong><small>{baseline.offence.mainSkill ?? 'main skill'}</small></article>
          </div>

          {integrity && (
            <section className={`build-doctor-integrity ${integrity.status}`} data-testid="build-doctor-integrity">
              <div className="build-doctor-integrity-head">
                <div>
                  <span>BASELINE INTEGRITY · PINNED POB</span>
                  <strong>{integrity.status === 'attention-required' ? 'Current build needs attention' : integrity.status === 'supported-checks-clear' ? 'Supported baseline checks are clear' : 'Baseline integrity unavailable'}</strong>
                </div>
                {integrity.status !== 'unavailable' && (
                  <div className="build-doctor-integrity-counts">
                    <i>{integrity.warningCount} proven gap{integrity.warningCount === 1 ? '' : 's'}</i>
                    {integrity.infoCount > 0 && <i>{integrity.infoCount} posture note{integrity.infoCount === 1 ? '' : 's'}</i>}
                  </div>
                )}
              </div>
              <p>{integrity.message}</p>
              {integrity.status !== 'unavailable' && integrity.findings.length > 0 && (
                <div className="build-doctor-integrity-list">
                  {integrity.findings.map((finding) => (
                    <article key={finding.key} className={finding.severity}>
                      <div><strong>{finding.label}</strong><span>{finding.severity === 'warning' ? 'Proven gap' : 'Context'}</span></div>
                      <code>{finding.value}</code>
                      <p>{finding.detail}</p>
                    </article>
                  ))}
                </div>
              )}
              {integrity.status !== 'unavailable' && (
                <small>Constraint adapter {integrity.kernel.adapterVersion} · current imported PoB state. Partial suppression and chaos resistance remain contextual unless stronger intent/content evidence exists.</small>
              )}
            </section>
          )}

          <div className="build-doctor-grid">
            <div className="build-doctor-card">
              <div className="section-title"><h3>Maximum hit</h3><span>PoB · imported state</span></div>
              <div className="build-doctor-hit-grid">
                <div><span>Physical</span><strong>{compactNumber(maxHits?.physical)}</strong></div>
                <div><span>Fire</span><strong>{compactNumber(maxHits?.fire)}</strong></div>
                <div><span>Cold</span><strong>{compactNumber(maxHits?.cold)}</strong></div>
                <div><span>Lightning</span><strong>{compactNumber(maxHits?.lightning)}</strong></div>
                <div><span>Chaos</span><strong>{compactNumber(maxHits?.chaos)}</strong></div>
              </div>
              <small className="build-doctor-boundary">These are the selected PoB configuration's numerical outputs, not an encounter-independent survivability rating.</small>
            </div>

            <div className="build-doctor-card">
              <div className="section-title"><h3>Configuration evidence</h3><span>{utilityRows.length ? `${activeUtilities}/${utilityRows.length} active` : 'none equipped'}</span></div>
              {utilityRows.length ? (
                <div className="build-doctor-utilities custom-scrollbar">
                  {utilityRows.map((entry) => (
                    <div key={entry.slot}>
                      <span className={entry.active ? 'doctor-dot active' : 'doctor-dot'} />
                      <div><strong>{entry.name}</strong><small>{entry.slot} · {entry.utility ? 'utility' : entry.life ? 'life' : 'mana'} · {entry.active ? 'enabled in PoB' : 'disabled in PoB'}</small></div>
                      <span>{entry.local.duration !== undefined ? `${entry.local.duration.toFixed(1)}s` : '—'}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="build-empty">No equipped utility configuration was exposed by this PoB.</p>}
              <small className="build-doctor-boundary">Enabled does not mean sustainably available while mapping or bossing. Encounter uptime is evaluated separately.</small>
            </div>
          </div>

          {profile && (
            <BuildDoctorDependencyPanel
              key={`dependencies:${profile.id}:${snapshot.generatedAt}`}
              profileId={profile.id}
              enabled={snapshot.status === 'ready'}
              activeUtilityCount={activeUtilityDependencies}
            />
          )}

          {profile && (
            <BuildDoctorPassiveContributionPanel
              key={`passive-contribution:${profile.id}:${snapshot.generatedAt}`}
              profileId={profile.id}
              enabled={snapshot.status === 'ready'}
            />
          )}

          {profile && (
            <BuildDoctorCandidateItemPanel
              key={`candidate:${profile.id}:${snapshot.generatedAt}`}
              profileId={profile.id}
              enabled={snapshot.status === 'ready'}
            />
          )}

          <div className="build-doctor-findings">
            <div className="section-title"><h3>Evidence & caveats</h3><span>{snapshot.findings.length}</span></div>
            {snapshot.findings.map((finding) => (
              <article className={finding.severity === 'warning' ? 'warning' : ''} key={finding.code}>
                <div><span>{finding.source === 'pob' ? 'PoB' : 'ExileQuesting'}</span><strong>{finding.title}</strong></div>
                <p>{finding.detail}</p>
              </article>
            ))}
          </div>

          <details className="build-doctor-provenance">
            <summary>Calculation provenance</summary>
            <dl>
              <div><dt>PoB commit</dt><dd><code>{snapshot.kernel?.pobCommit}</code></dd></div>
              <div><dt>Runtime revision</dt><dd><code>{snapshot.kernel?.runtimeRevision}</code></dd></div>
              <div><dt>Adapter</dt><dd><code>{snapshot.kernel?.adapterVersion}</code></dd></div>
              <div><dt>Calculated</dt><dd>{new Date(snapshot.generatedAt).toLocaleString()}</dd></div>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}
