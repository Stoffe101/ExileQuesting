import { useEffect, useState } from 'react';

type BuildWorkspaceState = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

export default function BuildWorkspace() {
  const [workspace, setWorkspace] = useState<BuildWorkspaceState | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => setWorkspace(await window.exileQuesting.getBuildWorkspace());

  useEffect(() => {
    void refresh().catch((value) => setError(value instanceof Error ? value.message : String(value)));
  }, []);

  const active = workspace?.planner.profiles.find((entry) => entry.profile.id === workspace.planner.activeProfileId);
  const activeStage = active?.stages.find((stage) => stage.id === active.activeStageId);
  const needs = workspace?.plan?.needs ?? [];

  const importBuild = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await window.exileQuesting.importBuildProfile(input.trim());
      setInput('');
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await window.exileQuesting.deleteBuildProfile(id);
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page custom-scrollbar build-page">
      <div className="page-heading compact-heading">
        <div>
          <span className="eyebrow">PATH OF BUILDING → CAMPAIGN</span>
          <h1>Build planner</h1>
          <p>Turn PoB stages into concrete leveling milestones and verified gem pickups.</p>
        </div>
        {workspace && (
          <span className={`status-pill ${workspace.gemData.status === 'ready' ? 'ok' : 'warning'}`}>
            <i />
            {workspace.gemData.status === 'ready' ? `PoE ${workspace.gemData.gameVersion} gems ready` : 'Gem data unavailable'}
          </span>
        )}
      </div>

      {error && <div className="inline-alert"><strong>Build planner</strong>{error}</div>}
      {workspace && workspace.gemData.status !== 'ready' && <div className="inline-alert"><strong>Bundled gem data problem</strong>{workspace.gemData.message}</div>}

      <div className="build-grid">
        <section className="panel build-import-panel">
          <div className="section-title"><h2>Import Path of Building</h2><span>XML · export code · pobb.in</span></div>
          <textarea
            className="build-import-textarea custom-scrollbar"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste a PoB export code, XML build, or pobb.in URL…"
          />
          <div className="build-import-actions">
            <small>Imports are parsed locally except pobb.in links, which fetch their bounded raw export.</small>
            <button className="primary-button" disabled={!input.trim() || busy} onClick={() => void importBuild()}>{busy ? 'Working…' : 'Import build'}</button>
          </div>
        </section>

        <section className="panel build-profile-panel">
          <div className="section-title"><h2>Build profiles</h2><span>{workspace?.planner.profiles.length ?? 0}/20</span></div>
          <div className="build-profile-list custom-scrollbar">
            {workspace?.planner.profiles.length ? workspace.planner.profiles.map((entry) => {
              const selected = entry.profile.id === workspace.planner.activeProfileId;
              return (
                <div className={`build-profile-row ${selected ? 'active' : ''}`} key={entry.profile.id}>
                  <button onClick={() => void window.exileQuesting.activateBuildProfile(entry.profile.id).then(setWorkspace)}>
                    <strong>{entry.profile.name}</strong>
                    <small>{entry.profile.build.level ? `Level ${entry.profile.build.level}` : 'Level not specified'} · {entry.stages.length} aligned stage{entry.stages.length === 1 ? '' : 's'}</small>
                  </button>
                  <button className="build-delete" disabled={busy} onClick={() => void deleteProfile(entry.profile.id)} aria-label={`Delete ${entry.profile.name}`}>×</button>
                </div>
              );
            }) : <p className="build-empty">Import a PoB build to create your first leveling plan.</p>}
          </div>
        </section>

        <section className="panel build-stage-panel">
          <div className="section-title"><h2>Active stage</h2><span>{activeStage?.confidence ?? 'none'}</span></div>
          {active ? (
            <>
              <div className="build-stage-list custom-scrollbar">
                {active.stages.map((stage) => (
                  <button className={stage.id === active.activeStageId ? 'active' : ''} key={stage.id} onClick={() => void window.exileQuesting.activateBuildStage(active.profile.id, stage.id).then(setWorkspace)}>
                    <strong>{stage.title}</strong>
                    <small>{stage.milestone.label ?? 'Unlabelled milestone'} · {stage.confidence} confidence</small>
                  </button>
                ))}
              </div>
              {activeStage && (
                <div className="build-stage-summary">
                  <span>Selected</span>
                  <strong>{activeStage.title}</strong>
                  <small>{[activeStage.tree && 'tree', activeStage.skills && 'skills', activeStage.items && 'items', activeStage.config && 'config'].filter(Boolean).join(' · ') || 'No stage families'}</small>
                </div>
              )}
            </>
          ) : <p className="build-empty">No active build profile.</p>}
        </section>

        <section className="panel build-plan-panel">
          <div className="section-title"><h2>Gem acquisition plan</h2><span>{needs.length} pickup{needs.length === 1 ? '' : 's'}</span></div>
          {workspace?.plan ? (
            <>
              <div className="build-plan-metrics">
                <div><strong>{workspace.campaign.actionSteps}</strong><span>route steps enhanced</span></div>
                <div><strong>{workspace.campaign.resolved}</strong><span>route matches</span></div>
                <div><strong>{workspace.campaign.unresolved}</strong><span>manual checks</span></div>
              </div>
              <div className="build-needs custom-scrollbar">
                {needs.map((need, index) => (
                  <article className={need.stageId === active?.activeStageId ? 'active' : ''} key={`${need.stageId}:${need.requirement.key}:${index}`}>
                    <div>
                      <strong>{need.requiredCopies > 1 ? `${need.requiredCopies}× ` : ''}{need.requirement.name}</strong>
                      <small>{need.stageTitle} · {need.status}</small>
                    </div>
                    <div className="build-source">
                      {need.preferred ? (
                        <>
                          <span>{need.preferred.kind === 'starting' ? 'Starting gem' : need.preferred.kind === 'quest' ? 'Quest reward' : 'Vendor'}</span>
                          <strong>{need.preferred.npc ?? need.preferred.questName ?? 'Character start'}</strong>
                          {need.preferred.act && <small>Act {need.preferred.act}{need.preferred.timingVerified ? ' · timing verified' : ' · timing needs confirmation'}</small>}
                        </>
                      ) : (
                        <><span>Source</span><strong>{need.status === 'unknown-gem' ? 'Gem could not be matched' : 'No class-valid source'}</strong></>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {workspace.plan.warnings.length > 0 && (
                <details className="build-warnings">
                  <summary>{workspace.plan.warnings.length} planner warning{workspace.plan.warnings.length === 1 ? '' : 's'}</summary>
                  {workspace.plan.warnings.slice(0, 12).map((warning) => <p key={warning}>{warning}</p>)}
                </details>
              )}
            </>
          ) : <p className="build-empty">Select or import a build to generate its acquisition plan.</p>}
        </section>
      </div>
    </div>
  );
}
