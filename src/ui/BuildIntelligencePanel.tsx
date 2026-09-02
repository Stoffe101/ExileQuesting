type Workspace = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

export default function BuildIntelligencePanel({ workspace, onWorkspace }: { workspace: Workspace; onWorkspace: (workspace: Workspace) => void }) {
  const coach = workspace.coach;
  const maxroll = coach?.maxroll;
  const loot = workspace.lootFilter;
  const chooseBase = async () => onWorkspace(await window.exileQuesting.selectLootFilterBase());
  const regenerate = async () => onWorkspace(await window.exileQuesting.regenerateLootFilter());
  const markReloaded = async () => onWorkspace(await window.exileQuesting.markLootFilterReloaded());
  const stepPassive = async (delta: number) => {
    if (coach) onWorkspace(await window.exileQuesting.stepBuildPassive(coach.profileId, delta));
  };

  return (
    <section className="panel build-intelligence-panel">
      <div className="section-title"><h2>Build intelligence</h2><span>{workspace.passiveData.status === 'ready' ? `PoE ${workspace.passiveData.gameVersion} tree` : 'Passive names unavailable'}</span></div>

      {maxroll && (
        <div className={`maxroll-guide-status ${maxroll.compatibility}`}>
          <div>
            <span>MAXROLL · {maxroll.mode === 'twink' ? 'TWINK LEVELING' : 'LEVELING GUIDE'}</span>
            <strong>{maxroll.guideTitle}</strong>
            <small>{maxroll.compatibilityMessage}</small>
            <small>
              {maxroll.guideModified ? `Guide updated ${maxroll.guideModified}` : 'Guide revision unavailable'}
              {maxroll.plannerTreeVersion ? ` · planner tree ${maxroll.plannerTreeVersion}` : ''}
              {maxroll.passiveTotal ? ` · ${maxroll.passiveCompleted}/${maxroll.passiveTotal} passive operations completed` : ''}
            </small>
          </div>
          <div className="setting-actions maxroll-actions">
            <a className="ghost-button button-link" href={maxroll.guideUrl} target="_blank" rel="noreferrer">Open guide ↗</a>
            <button className="ghost-button" disabled={maxroll.passiveCompleted <= 0} onClick={() => void stepPassive(-1)}>Back</button>
            {maxroll.nextPassive && (
              <button className="primary-button" onClick={() => void stepPassive(1)}>
                {maxroll.nextPassive.type === 'refund' ? 'Mark refunded' : 'Mark taken'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="build-intelligence-grid">
        <div className={`build-intelligence-card ${maxroll?.nextPassive ? 'maxroll-next-card' : ''}`}>
          <span>{maxroll ? 'Exact passive queue' : 'Next passive milestone'}</span>
          {maxroll ? (
            <>
              <strong>{maxroll.nextPassive ? `${maxroll.nextPassive.type === 'refund' ? 'Refund' : 'Allocate'} ${maxroll.nextPassive.nodeName}` : maxroll.passiveComplete ? 'Maxroll passive path complete' : 'Exact passive coaching unavailable'}</strong>
              {maxroll.nextPassive && <small>{maxroll.nextPassive.nodeKind ?? 'passive'} · step {maxroll.nextPassive.index}/{maxroll.nextPassive.total} · checkpoint {maxroll.nextPassive.checkpoint}</small>}
              {!maxroll.nextPassive && !maxroll.passiveComplete && <small>{maxroll.compatibilityMessage}</small>}
            </>
          ) : (
            <>
              <strong>{coach?.nextPassiveText ?? 'No later passive stage detected'}</strong>
              {coach?.nextPassive && <small>{coach.nextPassive.totalAllocations} allocations toward {coach.nextPassive.toTitle}</small>}
              {coach?.nextPassive && !coach.nextPassive.namesVerified && <small>Node names hidden because this PoB tree version does not match the bundled passive snapshot.</small>}
              {coach?.nextPassive?.namedTargets.length ? (
                <div className="mini-chip-row">{coach.nextPassive.namedTargets.slice(0, 4).map((target) => <i key={target.id}>{target.name}</i>)}</div>
              ) : null}
            </>
          )}
        </div>

        {maxroll && (
          <div className="build-intelligence-card">
            <span>Current leveling stage</span>
            <strong>{coach?.stageTitle ?? 'Waiting for character level'}</strong>
            <small>{coach?.currentGemTasks.length ? `${coach.currentGemTasks.length} new gem pickup${coach.currentGemTasks.length === 1 ? '' : 's'} in this stage` : 'No new gem purchases in this stage'}</small>
            {maxroll.mode === 'twink' && maxroll.equipmentMilestones.length > 0 && <small>{maxroll.equipmentMilestones.length} Twink equipment set{maxroll.equipmentMilestones.length === 1 ? '' : 's'} detected in the planner.</small>}
          </div>
        )}

        <div className="build-intelligence-card">
          <span>Loot targets</span>
          <strong>{coach?.loot.linkTargets.length ? `${coach.loot.linkTargets.length} link target${coach.loot.linkTargets.length === 1 ? '' : 's'}` : 'No resolved link target'}</strong>
          {coach?.loot.linkTargets.slice(0, 3).map((target) => (
            <small key={`${target.links}:${target.qualityBonusColours.join('')}`}>{target.links}L usable with any colours · bonus {target.qualityBonusColours.join('-')} · {target.label}</small>
          ))}
        </div>

        <div className="build-intelligence-card">
          <span>Campaign crafting</span>
          <strong>Contextual recipes + resistance checks</strong>
          {coach?.craftingHints.slice(0, 3).map((hint) => <small key={hint}>{hint}</small>)}
        </div>
      </div>

      <div className={`loot-filter-status ${loot.status} ${loot.needsReload ? 'reload' : ''}`}>
        <div>
          <span>BUILD-AWARE LOOT FILTER</span>
          <strong>{loot.message}</strong>
          {loot.outputPath && <small>{loot.outputPath}</small>}
        </div>
        <div className="setting-actions">
          <button className="ghost-button" onClick={() => void chooseBase()}>{loot.basePath ? 'Change base filter' : 'Choose base filter'}</button>
          {loot.basePath && <button className="ghost-button" onClick={() => void regenerate()}>Regenerate</button>}
          {loot.needsReload && <button className="primary-button" onClick={() => void markReloaded()}>I reloaded it</button>}
        </div>
      </div>
      <p className="build-filter-note">PoE 3.29 allows every gem in every equipment socket colour. ExileQuesting therefore prioritises usable link counts first and matching non-white colours only as a quality bonus. Unmatched drops fall through to your selected base filter.</p>
    </section>
  );
}
