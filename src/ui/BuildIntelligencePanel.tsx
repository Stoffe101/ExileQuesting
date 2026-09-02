type Workspace = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

export default function BuildIntelligencePanel({ workspace, onWorkspace }: { workspace: Workspace; onWorkspace: (workspace: Workspace) => void }) {
  const coach = workspace.coach;
  const loot = workspace.lootFilter;
  const chooseBase = async () => onWorkspace(await window.exileQuesting.selectLootFilterBase());
  const regenerate = async () => onWorkspace(await window.exileQuesting.regenerateLootFilter());
  const markReloaded = async () => onWorkspace(await window.exileQuesting.markLootFilterReloaded());

  return (
    <section className="panel build-intelligence-panel">
      <div className="section-title"><h2>Build intelligence</h2><span>{workspace.passiveData.status === 'ready' ? `PoE ${workspace.passiveData.gameVersion} tree` : 'Passive names unavailable'}</span></div>
      <div className="build-intelligence-grid">
        <div className="build-intelligence-card">
          <span>Next passive milestone</span>
          <strong>{coach?.nextPassiveText ?? 'No later passive stage detected'}</strong>
          {coach?.nextPassive && <small>{coach.nextPassive.totalAllocations} allocations toward {coach.nextPassive.toTitle}</small>}
          {coach?.nextPassive && !coach.nextPassive.namesVerified && <small>Node names hidden because this PoB tree version does not match the bundled passive snapshot.</small>}
          {coach?.nextPassive?.namedTargets.length ? (
            <div className="mini-chip-row">{coach.nextPassive.namedTargets.slice(0, 4).map((target) => <i key={target.id}>{target.name}</i>)}</div>
          ) : null}
        </div>

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
