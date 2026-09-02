import { useState } from 'react';
import type { VendorSearchKind, VendorSearchQuery } from '../core/vendor-search';
import { copyText } from './clipboard';
import './vendor-search.css';

type Workspace = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

function VendorSearchCard({ query, copied, onCopy }: { query: VendorSearchQuery; copied: boolean; onCopy: (query: VendorSearchQuery) => void }) {
  return (
    <div className="vendor-search-card">
      <div className="vendor-search-card-head">
        <div>
          <span>{query.kind === 'equipment' ? 'GEAR' : 'GEMS'} · {query.label}</span>
          <strong>{query.included.length} target{query.included.length === 1 ? '' : 's'} packed into one search</strong>
        </div>
        <small>{query.length}/250</small>
      </div>
      <code className="vendor-search-code custom-scrollbar" tabIndex={0}>{query.query}</code>
      <div className="vendor-search-meta">
        <p>{query.note}</p>
        <button className="ghost-button" onClick={() => onCopy(query)}>{copied ? 'Copied ✓' : 'Copy search'}</button>
      </div>
      <div className="vendor-search-included">
        {query.included.slice(0, 5).map((label) => <i key={label}>{label}</i>)}
        {query.included.length > 5 && <i>+{query.included.length - 5} more</i>}
        {query.omitted > 0 && <i className="omitted">{query.omitted} omitted by limit</i>}
      </div>
    </div>
  );
}

export default function BuildIntelligencePanel({ workspace, onWorkspace }: { workspace: Workspace; onWorkspace: (workspace: Workspace) => void }) {
  const [copiedVendor, setCopiedVendor] = useState<VendorSearchKind | null>(null);
  const [vendorCopyError, setVendorCopyError] = useState('');
  const coach = workspace.coach;
  const maxroll = coach?.maxroll;
  const stageNeedsReview = !maxroll && coach?.stageConfidence === 'ambiguous';
  const vendorSearch = coach?.vendorSearch;
  const loot = workspace.lootFilter;
  const chooseBase = async () => onWorkspace(await window.exileQuesting.selectLootFilterBase());
  const regenerate = async () => onWorkspace(await window.exileQuesting.regenerateLootFilter());
  const markReloaded = async () => onWorkspace(await window.exileQuesting.markLootFilterReloaded());
  const stepPassive = async (delta: number) => {
    if (coach) onWorkspace(await window.exileQuesting.stepBuildPassive(coach.profileId, delta));
  };
  const copyVendorSearch = async (query: VendorSearchQuery) => {
    setVendorCopyError('');
    try {
      await copyText(query.query, 'Clipboard access was blocked. Select the search text and copy it manually.');
      setCopiedVendor(query.kind);
      window.setTimeout(() => setCopiedVendor((current) => current === query.kind ? null : current), 1400);
    } catch (error) {
      setVendorCopyError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel build-intelligence-panel">
      <div className="section-title"><h2>Build intelligence</h2><span>{workspace.passiveData.status === 'ready' ? `PoE ${workspace.passiveData.gameVersion} tree` : 'Passive names unavailable'}</span></div>

      {stageNeedsReview && (
        <div className="inline-alert">
          <strong>Selected PoB stage needs review</strong>
          ExileQuesting could not safely reconcile this set with the other PoB families. Guidance below uses only the data actually present in the selected set; inspect the alignment reasons in Build Planner before treating it as a complete build state.
        </div>
      )}

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

        <div className="build-intelligence-card build-look-for-card">
          <span>LOOK FOR</span>
          <strong>{coach?.gearHints[0]?.label ?? 'Stage-aware gear targets unavailable'}</strong>
          {coach?.gearHints.slice(1, 4).map((hint) => <small key={hint.label}>{hint.label}</small>)}
        </div>

        <div className="build-intelligence-card">
          <span>Loot targets</span>
          <strong>{coach ? `${coach.loot.baseTargets.length} gear base${coach.loot.baseTargets.length === 1 ? '' : 's'} · ${coach.loot.linkTargets.length} link target${coach.loot.linkTargets.length === 1 ? '' : 's'}` : 'No resolved build targets'}</strong>
          {coach?.loot.baseTargets.slice(0, 2).map((target) => <small key={`${target.slot}:${target.baseType}`}>{target.slotName}: {target.name ?? target.baseType}</small>)}
          {coach?.loot.linkTargets.slice(0, 2).map((target) => (
            <small key={`${target.links}:${target.qualityBonusColours.join('')}`}>{target.links}L usable with any colours · bonus {target.qualityBonusColours.join('-')} · {target.label}</small>
          ))}
        </div>

        <div className="build-intelligence-card">
          <span>Campaign crafting</span>
          <strong>Contextual recipes + resistance checks</strong>
          {coach?.craftingHints.slice(0, 3).map((hint) => <small key={hint}>{hint}</small>)}
        </div>
      </div>

      <div className="vendor-search-panel">
        <div className="vendor-search-heading">
          <div>
            <span>VENDOR SEARCH · ACTIVE STAGE</span>
            <strong>Scan the vendor for what this build needs right now</strong>
            <small>Copy a generated search, open the relevant vendor, then paste it into Path of Exile yourself. ExileQuesting never sends input to the game.</small>
          </div>
          <i>{coach?.stageTitle ?? 'No active build stage'}</i>
        </div>

        {vendorSearch?.equipment || vendorSearch?.gems ? (
          <div className="vendor-search-grid">
            {vendorSearch.equipment && <VendorSearchCard query={vendorSearch.equipment} copied={copiedVendor === 'equipment'} onCopy={(query) => void copyVendorSearch(query)} />}
            {vendorSearch.gems && <VendorSearchCard query={vendorSearch.gems} copied={copiedVendor === 'gems'} onCopy={(query) => void copyVendorSearch(query)} />}
          </div>
        ) : (
          <div className="vendor-search-empty">No stage-specific vendor search is needed yet. Import a build or advance to a stage with vendor pickups/gear targets.</div>
        )}

        {vendorSearch?.warnings.map((warning) => <p className="vendor-search-warning" key={warning}>{warning}</p>)}
        {vendorCopyError && <div className="inline-alert"><strong>Vendor search</strong>{vendorCopyError}</div>}
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
      <p className="build-filter-note">PoE 3.29 allows every gem in every equipment socket colour. ExileQuesting prioritises usable links first, highlights stage-specific bases/uniques when the build exposes them, and treats matching non-white colours only as a quality bonus. Everything else falls through to your selected base filter.</p>
    </section>
  );
}
