import { promises as fs } from 'node:fs';

async function replaceOnce(file, before, after) {
  let text = await fs.readFile(file, 'utf8');
  if (text.includes(after)) return false;
  if (!text.includes(before)) throw new Error(`Could not find expected anchor in ${file}: ${before.slice(0, 100)}`);
  text = text.replace(before, after);
  await fs.writeFile(file, text, 'utf8');
  return true;
}

async function appendOnce(file, marker, content) {
  let text = await fs.readFile(file, 'utf8');
  if (text.includes(marker)) return false;
  text = `${text.trimEnd()}\n\n${content.trim()}\n`;
  await fs.writeFile(file, text, 'utf8');
  return true;
}

const changed = [];
async function patch(file, before, after) {
  if (await replaceOnce(file, before, after)) changed.push(file);
}

await patch(
  'src/core/gem-data-import.ts',
  `): GemAcquisitionSnapshot {\n  const offers: GemAcquisitionSnapshot['offers'] = [];`,
  `): GemAcquisitionSnapshot {\n  // Reward offers can contain armour, weapons and other quest items next to gems. The upstream\n  // gems table is the authoritative allowlist: only IDs present there may enter acquisition data.\n  const upstreamGemIds = new Set(\n    Object.values(object(upstreamGems)).flatMap((candidate) => {\n      const gem = object(candidate);\n      return typeof gem.id === 'string' ? [gem.id] : [];\n    }),\n  );\n  const offers: GemAcquisitionSnapshot['offers'] = [];`,
);
await patch(
  'src/core/gem-data-import.ts',
  `      for (const [gemId, rawReward] of Object.entries(object(offer.quest))) {\n        const reward = object(rawReward);`,
  `      for (const [gemId, rawReward] of Object.entries(object(offer.quest))) {\n        if (!upstreamGemIds.has(gemId)) continue;\n        const reward = object(rawReward);`,
);
await patch(
  'src/core/gem-data-import.ts',
  `      for (const [gemId, rawReward] of Object.entries(object(offer.vendor))) {\n        const reward = object(rawReward);`,
  `      for (const [gemId, rawReward] of Object.entries(object(offer.vendor))) {\n        if (!upstreamGemIds.has(gemId)) continue;\n        const reward = object(rawReward);`,
);
await patch(
  'src/core/gem-data-import.ts',
  `    const ids = [character.start_gem_id, character.chest_gem_id].filter((value): value is string => typeof value === 'string' && Boolean(value));`,
  `    const ids = [character.start_gem_id, character.chest_gem_id].filter((value): value is string => typeof value === 'string' && Boolean(value) && upstreamGemIds.has(value));`,
);

await patch(
  'src/core/gem-data.test.ts',
  `        quest: { 'Metadata/Items/Gems/SkillGemArc': { classes: ['Witch'] } },\n        vendor: { 'Metadata/Items/Gems/SkillGemFireball': { classes: [], npc: 'Nessa' } },`,
  `        quest: {\n          'Metadata/Items/Gems/SkillGemArc': { classes: ['Witch'] },\n          'Metadata/Items/Armours/BodyArmours/BodyDex1': { classes: ['Ranger'] },\n        },\n        vendor: {\n          'Metadata/Items/Gems/SkillGemFireball': { classes: [], npc: 'Nessa' },\n          'Metadata/Items/Weapons/OneHandWeapons/OneHandSwords/OneHandSword1': { classes: [], npc: 'Nessa' },\n        },`,
);
await patch(
  'src/core/gem-data.test.ts',
  `    expect(snapshot.offers).toEqual(expect.arrayContaining([\n      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemArc', kind: 'quest', questId: 'a1q4', npc: 'Nessa', classes: ['Witch'] }),\n      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemFireball', kind: 'vendor', npc: 'Nessa', classes: [] }),\n    ]));`,
  `    expect(snapshot.offers).toEqual(expect.arrayContaining([\n      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemArc', kind: 'quest', questId: 'a1q4', npc: 'Nessa', classes: ['Witch'] }),\n      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemFireball', kind: 'vendor', npc: 'Nessa', classes: [] }),\n    ]));\n    expect(snapshot.offers.every((offer) => offer.gemId.startsWith('Metadata/Items/Gems/'))).toBe(true);\n    expect(snapshot.offers).toHaveLength(2);`,
);

await patch(
  'src/core/gem-data.ts',
  `  for (const [className, value] of Object.entries(starts)) {\n    if (className.length > 80 || !Array.isArray(value)) continue;\n    startingGems[className] = value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 300).slice(0, 10);\n  }\n\n  return {`,
  `  for (const [className, value] of Object.entries(starts)) {\n    if (className.length > 80 || !Array.isArray(value)) continue;\n    startingGems[className] = value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 300).slice(0, 10);\n  }\n\n  // Schema-valid is not enough for bundled runtime data. Enforce referential integrity here so\n  // development, CI and packaged builds all reject polluted/corrupt snapshots the same way.\n  const gemIds = new Set<string>();\n  for (const gem of gems) {\n    if (gemIds.has(gem.id)) return null;\n    gemIds.add(gem.id);\n  }\n  const offerKeys = new Set<string>();\n  for (const offer of offers) {\n    if (!gemIds.has(offer.gemId)) return null;\n    const key = [offer.gemId, offer.kind, offer.questId, offer.rewardOfferId, offer.npc, [...offer.classes].sort().join(',')].join('|');\n    if (offerKeys.has(key)) return null;\n    offerKeys.add(key);\n  }\n  for (const gemIdsForClass of Object.values(startingGems)) {\n    if (gemIdsForClass.some((gemId) => !gemIds.has(gemId))) return null;\n  }\n\n  return {`,
);
await patch(
  'src/core/gem-data.test.ts',
  `  it('rejects malformed snapshots instead of partially trusting them', () => {\n    expect(validateGemAcquisitionSnapshot({ schemaVersion: 1, gameVersion: '3.29' })).toBeNull();\n  });`,
  `  it('rejects malformed snapshots instead of partially trusting them', () => {\n    expect(validateGemAcquisitionSnapshot({ schemaVersion: 1, gameVersion: '3.29' })).toBeNull();\n  });\n\n  it('rejects structurally valid snapshots with broken gem references', () => {\n    const snapshot = buildGemAcquisitionSnapshot(gems, quests, characters, { gameVersion: '3.29', generatedAt: '2026-09-02T01:00:00.000Z', source });\n    const broken = { ...snapshot, offers: [{ ...snapshot.offers[0], gemId: 'Metadata/Items/Armours/BodyArmours/BodyDex1' }] };\n    expect(validateGemAcquisitionSnapshot(broken)).toBeNull();\n  });`,
);

await patch(
  'electron/main.ts',
  `import { defaultBuildProfileName, upsertBuildProfile, type BuildProfile } from '../src/core/build-profiles';`,
  `import { defaultBuildProfileName, upsertBuildProfile, type BuildProfile } from '../src/core/build-profiles';\nimport { activateBuildProfile, activateBuildStage, buildPlannerSnapshot, normalizeBuildPlannerState, type BuildPlannerState } from '../src/core/build-planner';\nimport { buildGemAcquisitionPlan, type GemAcquisitionPlan } from '../src/core/gem-acquisition';\nimport { bridgeBuildPlanToCampaign, campaignBuildActionsForStep, type CampaignBuildBridge } from '../src/core/build-campaign';\nimport { bundledGemDataPath, loadGemAcquisitionSnapshot, type GameDataLoadResult } from './services/game-data';`,
);
await patch(
  'electron/main.ts',
  `let buildProfiles: BuildProfile[] = [];\nlet appUpdate: AppUpdateState = {`,
  `let buildProfiles: BuildProfile[] = [];\nlet buildPlannerState: BuildPlannerState = { schemaVersion: 1, activeStageByProfile: {} };\nlet gemData: GameDataLoadResult = { path: '', status: 'missing', message: 'Bundled gem acquisition data has not been loaded yet.' };\nlet activeGemPlan: GemAcquisitionPlan | undefined;\nlet buildBridge: CampaignBuildBridge | undefined;\nlet appUpdate: AppUpdateState = {`,
);
await patch(
  'electron/main.ts',
  `  buildProfiles = await store.loadBuildProfiles();\n}`,
  `  buildProfiles = await store.loadBuildProfiles();\n  buildPlannerState = await store.loadBuildPlanner(buildProfiles);\n}`,
);
await patch(
  'electron/main.ts',
  `  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);\n}\n\nfunction enabled(step: CampaignDataset['steps'][number]): boolean { return isStepEnabled(step, settings); }`,
  `  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);\n}\n\nasync function loadBuildGameData(): Promise<void> {\n  const filePath = bundledGemDataPath({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() });\n  gemData = await loadGemAcquisitionSnapshot(filePath, {\n    info: (...args) => log.info(...args),\n    warn: (...args) => log.warn(...args),\n  });\n}\n\nfunction rebuildBuildGuidance(): void {\n  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);\n  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);\n  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;\n  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;\n}\n\nfunction buildAwareDataset(): CampaignDataset {\n  if (!buildBridge || !Object.keys(buildBridge.actionsByStep).length) return dataset;\n  return {\n    ...dataset,\n    steps: dataset.steps.map((step) => {\n      const buildActions = campaignBuildActionsForStep(buildBridge!, step.id);\n      return buildActions.length ? { ...step, actions: [...step.actions, ...buildActions] } : step;\n    }),\n  };\n}\n\nfunction buildWorkspaceSnapshot() {\n  return {\n    planner: buildPlannerSnapshot(buildProfiles, buildPlannerState),\n    gemData: {\n      status: gemData.status,\n      message: gemData.message,\n      gameVersion: gemData.snapshot?.gameVersion,\n      sourceCommit: gemData.snapshot?.source.commit,\n    },\n    plan: activeGemPlan,\n    campaign: {\n      resolved: buildBridge?.gemAvailability.filter((entry) => entry.confidence !== 'unresolved').length ?? 0,\n      unresolved: buildBridge?.unresolved.length ?? 0,\n      actionSteps: buildBridge ? Object.keys(buildBridge.actionsByStep).length : 0,\n    },\n  };\n}\n\nfunction enabled(step: CampaignDataset['steps'][number]): boolean { return isStepEnabled(step, settings); }`,
);
await patch(
  'electron/main.ts',
  `    settings, dataset, sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,`,
  `    settings, dataset: buildAwareDataset(), sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,`,
);
await patch(
  'electron/main.ts',
  `    confirmedRewardStepIds = new Set([...confirmedRewardStepIds].filter((id) => dataset.steps.some((step) => step.id === id)));\n    await saveRewardConfirmations();`,
  `    confirmedRewardStepIds = new Set([...confirmedRewardStepIds].filter((id) => dataset.steps.some((step) => step.id === id)));\n    await saveRewardConfirmations();\n    rebuildBuildGuidance();`,
);
await patch(
  'electron/main.ts',
  `  ipcMain.handle('pob:list', () => buildProfiles);\n  ipcMain.handle('pob:import', async (_event, input: unknown) => {\n    if (typeof input !== 'string') throw new Error('PoB input must be text.');\n    const imported = await importPobBuild(input, app.getVersion());\n    const profile: BuildProfile = { ...imported, name: defaultBuildProfileName(imported.build) };\n    buildProfiles = upsertBuildProfile(buildProfiles, profile);\n    await store.saveBuildProfiles(buildProfiles);\n    return buildProfiles;\n  });\n  ipcMain.handle('pob:delete', async (_event, id: unknown) => {\n    if (typeof id !== 'string' || id.length > 256) return buildProfiles;\n    buildProfiles = buildProfiles.filter((profile) => profile.id !== id);\n    await store.saveBuildProfiles(buildProfiles);\n    return buildProfiles;\n  });`,
  `  ipcMain.handle('pob:list', () => buildProfiles);\n  ipcMain.handle('pob:workspace', () => buildWorkspaceSnapshot());\n  ipcMain.handle('pob:import', async (_event, input: unknown) => {\n    if (typeof input !== 'string') throw new Error('PoB input must be text.');\n    const imported = await importPobBuild(input, app.getVersion());\n    const profile: BuildProfile = { ...imported, name: defaultBuildProfileName(imported.build) };\n    buildProfiles = upsertBuildProfile(buildProfiles, profile);\n    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);\n    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    broadcastState();\n    return buildProfiles;\n  });\n  ipcMain.handle('pob:activate-profile', async (_event, id: unknown) => {\n    if (typeof id !== 'string' || id.length > 256) return buildWorkspaceSnapshot();\n    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, id);\n    rebuildBuildGuidance();\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    broadcastState();\n    return buildWorkspaceSnapshot();\n  });\n  ipcMain.handle('pob:activate-stage', async (_event, profileId: unknown, stageId: unknown) => {\n    if (typeof profileId !== 'string' || typeof stageId !== 'string' || profileId.length > 256 || stageId.length > 256) return buildWorkspaceSnapshot();\n    buildPlannerState = activateBuildStage(buildPlannerState, buildProfiles, profileId, stageId);\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    broadcastState();\n    return buildWorkspaceSnapshot();\n  });\n  ipcMain.handle('pob:delete', async (_event, id: unknown) => {\n    if (typeof id !== 'string' || id.length > 256) return buildProfiles;\n    buildProfiles = buildProfiles.filter((profile) => profile.id !== id);\n    buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);\n    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    broadcastState();\n    return buildProfiles;\n  });`,
);
await patch(
  'electron/main.ts',
  `    await loadPersistentState();\n    await loadLocalCompatibility();\n    await loadCampaign();\n    if (isSmokeTest) { log.info(\`Packaged startup smoke test passed with \${dataset.steps.length} campaign steps.\`); app.exit(0); return; }`,
  `    await loadPersistentState();\n    await loadLocalCompatibility();\n    await loadCampaign();\n    await loadBuildGameData();\n    rebuildBuildGuidance();\n    if (isSmokeTest) {\n      if (gemData.status !== 'ready') throw new Error(\`Packaged gem data failed startup smoke: \${gemData.message}\`);\n      log.info(\`Packaged startup smoke test passed with \${dataset.steps.length} campaign steps and PoE \${gemData.snapshot?.gameVersion} gem data.\`);\n      app.exit(0); return;\n    }`,
);

await patch(
  'electron/preload.ts',
  `import type { BuildProfile } from '../src/core/build-profiles';`,
  `import type { BuildProfile } from '../src/core/build-profiles';\nimport type { BuildPlannerSnapshot } from '../src/core/build-planner';\nimport type { GemAcquisitionPlan } from '../src/core/gem-acquisition';`,
);
await patch(
  'electron/preload.ts',
  `export interface SimulationResult {\n  name: string;\n  report: CampaignSimulationReport;\n}\n\nconst api = {`,
  `export interface SimulationResult {\n  name: string;\n  report: CampaignSimulationReport;\n}\n\nexport interface BuildWorkspaceResult {\n  planner: BuildPlannerSnapshot;\n  gemData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sourceCommit?: string };\n  plan?: GemAcquisitionPlan;\n  campaign: { resolved: number; unresolved: number; actionSteps: number };\n}\n\nconst api = {`,
);
await patch(
  'electron/preload.ts',
  `  listBuildProfiles: (): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:list'),\n  importBuildProfile: (input: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:import', input),\n  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),`,
  `  listBuildProfiles: (): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:list'),\n  getBuildWorkspace: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:workspace'),\n  importBuildProfile: (input: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:import', input),\n  activateBuildProfile: (id: string): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:activate-profile', id),\n  activateBuildStage: (profileId: string, stageId: string): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:activate-stage', profileId, stageId),\n  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),`,
);

await patch(
  'src/ui/App.tsx',
  `type Tab = 'overview' | 'guide' | 'knowledge' | 'settings' | 'diagnostics';`,
  `type Tab = 'overview' | 'guide' | 'build' | 'knowledge' | 'settings' | 'diagnostics';`,
);
await patch(
  'src/ui/App.tsx',
  `  { id: 'guide', label: 'Campaign', icon: '◇' },\n  { id: 'knowledge', label: 'Knowledge', icon: '✦' },`,
  `  { id: 'guide', label: 'Campaign', icon: '◇' },\n  { id: 'build', label: 'Build', icon: '⬡' },\n  { id: 'knowledge', label: 'Knowledge', icon: '✦' },`,
);
await patch(
  'src/ui/App.tsx',
  `<article className="panel compact-panel"><span className="eyebrow">BUILD</span><h3 className="placeholder-title">No build imported yet</h3><p className="panel-copy">PoB-aware gem, tree and gear milestones arrive in the next major milestone.</p></article>`,
  `<article className="panel compact-panel"><span className="eyebrow">BUILD</span><h3 className="placeholder-title">PoB to Play</h3><p className="panel-copy">Import a Path of Building build, choose its leveling stage, and surface class-valid gem pickups directly in the campaign.</p><button className="ghost-button" onClick={() => onNavigate('build')}>Open build planner</button></article>`,
);

const buildComponent = String.raw`type BuildWorkspaceState = Awaited<ReturnType<typeof window.exileQuesting.getBuildWorkspace>>;

function BuildWorkspace() {
  const [workspace, setWorkspace] = useState<BuildWorkspaceState | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => setWorkspace(await window.exileQuesting.getBuildWorkspace());
  useEffect(() => { void refresh().catch((value) => setError(value instanceof Error ? value.message : String(value))); }, []);

  const active = workspace?.planner.profiles.find((entry) => entry.profile.id === workspace.planner.activeProfileId);
  const activeStage = active?.stages.find((stage) => stage.id === active.activeStageId);
  const needs = workspace?.plan?.needs ?? [];

  const importBuild = async () => {
    if (!input.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await window.exileQuesting.importBuildProfile(input.trim());
      setInput('');
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally { setBusy(false); }
  };

  const deleteProfile = async (id: string) => {
    setBusy(true); setError('');
    try { await window.exileQuesting.deleteBuildProfile(id); await refresh(); }
    catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setBusy(false); }
  };

  return (
    <div className="page custom-scrollbar build-page">
      <div className="page-heading compact-heading"><div><span className="eyebrow">PATH OF BUILDING → CAMPAIGN</span><h1>Build planner</h1><p>Turn PoB stages into concrete leveling milestones and verified gem pickups.</p></div>{workspace && <span className={`status-pill ${workspace.gemData.status === 'ready' ? 'ok' : 'warning'}`}><i />{workspace.gemData.status === 'ready' ? `PoE ${workspace.gemData.gameVersion} gems ready` : 'Gem data unavailable'}</span>}</div>
      {error && <div className="inline-alert"><strong>Build planner</strong>{error}</div>}
      {workspace && workspace.gemData.status !== 'ready' && <div className="inline-alert"><strong>Bundled gem data problem</strong>{workspace.gemData.message}</div>}

      <div className="build-grid">
        <section className="panel build-import-panel">
          <div className="section-title"><h2>Import Path of Building</h2><span>XML · export code · pobb.in</span></div>
          <textarea className="build-import-textarea custom-scrollbar" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a PoB export code, XML build, or pobb.in URL…" />
          <div className="build-import-actions"><small>Imports are parsed locally except pobb.in links, which fetch their bounded raw export.</small><button className="primary-button" disabled={!input.trim() || busy} onClick={() => void importBuild()}>{busy ? 'Working…' : 'Import build'}</button></div>
        </section>

        <section className="panel build-profile-panel">
          <div className="section-title"><h2>Build profiles</h2><span>{workspace?.planner.profiles.length ?? 0}/20</span></div>
          <div className="build-profile-list custom-scrollbar">
            {workspace?.planner.profiles.length ? workspace.planner.profiles.map((entry) => {
              const selected = entry.profile.id === workspace.planner.activeProfileId;
              return <div className={`build-profile-row ${selected ? 'active' : ''}`} key={entry.profile.id}><button onClick={() => void window.exileQuesting.activateBuildProfile(entry.profile.id).then(setWorkspace)}><strong>{entry.profile.name}</strong><small>{entry.profile.build.level ? `Level ${entry.profile.build.level}` : 'Level not specified'} · {entry.stages.length} aligned stage{entry.stages.length === 1 ? '' : 's'}</small></button><button className="build-delete" disabled={busy} onClick={() => void deleteProfile(entry.profile.id)} aria-label={`Delete ${entry.profile.name}`}>×</button></div>;
            }) : <p className="build-empty">Import a PoB build to create your first leveling plan.</p>}
          </div>
        </section>

        <section className="panel build-stage-panel">
          <div className="section-title"><h2>Active stage</h2><span>{activeStage?.confidence ?? 'none'}</span></div>
          {active ? <><div className="build-stage-list custom-scrollbar">{active.stages.map((stage) => <button className={stage.id === active.activeStageId ? 'active' : ''} key={stage.id} onClick={() => void window.exileQuesting.activateBuildStage(active.profile.id, stage.id).then(setWorkspace)}><strong>{stage.title}</strong><small>{stage.milestone.label ?? 'Unlabelled milestone'} · {stage.confidence} confidence</small></button>)}</div>{activeStage && <div className="build-stage-summary"><span>Selected</span><strong>{activeStage.title}</strong><small>{[activeStage.tree && 'tree', activeStage.skills && 'skills', activeStage.items && 'items', activeStage.config && 'config'].filter(Boolean).join(' · ') || 'No stage families'}</small></div>}</> : <p className="build-empty">No active build profile.</p>}
        </section>

        <section className="panel build-plan-panel">
          <div className="section-title"><h2>Gem acquisition plan</h2><span>{needs.length} pickup{needs.length === 1 ? '' : 's'}</span></div>
          {workspace?.plan ? <><div className="build-plan-metrics"><div><strong>{workspace.campaign.actionSteps}</strong><span>route steps enhanced</span></div><div><strong>{workspace.campaign.resolved}</strong><span>route matches</span></div><div><strong>{workspace.campaign.unresolved}</strong><span>manual checks</span></div></div><div className="build-needs custom-scrollbar">{needs.map((need, index) => <article className={need.stageId === active?.activeStageId ? 'active' : ''} key={`${need.stageId}:${need.requirement.key}:${index}`}><div><strong>{need.requiredCopies > 1 ? `${need.requiredCopies}× ` : ''}{need.requirement.name}</strong><small>{need.stageTitle} · {need.status}</small></div><div className="build-source">{need.preferred ? <><span>{need.preferred.kind === 'starting' ? 'Starting gem' : need.preferred.kind === 'quest' ? 'Quest reward' : 'Vendor'}</span><strong>{need.preferred.npc ?? need.preferred.questName ?? 'Character start'}</strong>{need.preferred.act && <small>Act {need.preferred.act}{need.preferred.timingVerified ? ' · timing verified' : ' · timing needs confirmation'}</small>}</> : <><span>Source</span><strong>{need.status === 'unknown-gem' ? 'Gem could not be matched' : 'No class-valid source'}</strong></>}</div></article>)}</div>{workspace.plan.warnings.length > 0 && <details className="build-warnings"><summary>{workspace.plan.warnings.length} planner warning{workspace.plan.warnings.length === 1 ? '' : 's'}</summary>{workspace.plan.warnings.slice(0, 12).map((warning) => <p key={warning}>{warning}</p>)}</details>}</> : <p className="build-empty">Select or import a build to generate its acquisition plan.</p>}
        </section>
      </div>
    </div>
  );
}
`;
await patch(
  'src/ui/App.tsx',
  `const KNOWLEDGE = [`,
  `${buildComponent}\nconst KNOWLEDGE = [`,
);
await patch(
  'src/ui/App.tsx',
  `        {tab === 'guide' && <CampaignGuide state={state} setState={setState} />}\n        {tab === 'knowledge' && <Knowledge />}`,
  `        {tab === 'guide' && <CampaignGuide state={state} setState={setState} />}\n        {tab === 'build' && <BuildWorkspace />}\n        {tab === 'knowledge' && <Knowledge />}`,
);

const css = `/* PR #9: PoB to Play workspace */
.build-grid { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(340px, 1.2fr); gap: 13px; align-items: start; }
.build-grid > .panel { padding: 20px; min-width: 0; }
.build-import-textarea { width: 100%; min-height: 150px; margin: 14px 0 10px; resize: vertical; border: 1px solid var(--line); border-radius: 9px; padding: 12px; background: #0d1016; color: #e7eaf0; line-height: 1.45; }
.build-import-textarea:focus { outline: 2px solid #f0ad55; outline-offset: 2px; }
.build-import-actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.build-import-actions small, .build-empty, .build-stage-summary small { color: var(--muted); font-size: 10px; line-height: 1.5; }
.build-profile-list, .build-stage-list, .build-needs { display: flex; flex-direction: column; gap: 7px; max-height: 360px; margin-top: 13px; overflow: auto; }
.build-profile-row { display: grid; grid-template-columns: minmax(0, 1fr) 34px; border: 1px solid var(--line-soft); border-radius: 9px; overflow: hidden; background: #131720; }
.build-profile-row.active { border-color: #66502f; background: rgba(239,169,78,.08); }
.build-profile-row > button:first-child, .build-stage-list button { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 11px 12px; border: 0; background: transparent; cursor: pointer; text-align: left; }
.build-profile-row small, .build-stage-list small, .build-needs small { color: var(--muted); font-size: 9px; }
.build-delete { border: 0; border-left: 1px solid var(--line-soft); background: transparent; color: var(--muted); cursor: pointer; font-size: 18px; }
.build-stage-list button { border: 1px solid var(--line-soft); border-radius: 9px; color: #cfd4dd; background: #131720; }
.build-stage-list button.active { border-color: #66502f; background: rgba(239,169,78,.09); color: #f4cf91; }
.build-stage-summary { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; padding: 12px; border: 1px solid var(--line-soft); border-radius: 9px; background: #0f1219; }
.build-stage-summary > span, .build-source > span { color: var(--accent); font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
.build-plan-panel { grid-column: 1 / -1; }
.build-plan-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 13px 0; }
.build-plan-metrics > div { padding: 11px 12px; border: 1px solid var(--line-soft); border-radius: 8px; background: #0f1219; }
.build-plan-metrics strong { display: block; font-size: 20px; }
.build-plan-metrics span { color: var(--muted); font-size: 9px; }
.build-needs { max-height: 430px; }
.build-needs article { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, .65fr); gap: 16px; align-items: center; padding: 11px 12px; border: 1px solid var(--line-soft); border-radius: 9px; background: #11151d; }
.build-needs article.active { border-color: #66502f; background: rgba(239,169,78,.07); }
.build-needs article > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.build-source { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.build-warnings { margin-top: 12px; color: var(--muted); font-size: 10px; }
.build-warnings summary { color: #f1c57f; cursor: pointer; }
.build-warnings p { margin: 8px 0 0; line-height: 1.45; }
@media (max-width: 1080px) { .build-grid { grid-template-columns: 1fr; } .build-plan-panel { grid-column: auto; } }
@media (max-width: 760px) { .build-needs article { grid-template-columns: 1fr; } .build-plan-metrics { grid-template-columns: 1fr; } .build-import-actions { align-items: stretch; flex-direction: column; } }`;
if (await appendOnce('src/ui/styles.css', '/* PR #9: PoB to Play workspace */', css)) changed.push('src/ui/styles.css');

console.log(`Patched ${[...new Set(changed)].length} files: ${[...new Set(changed)].join(', ') || 'none (already applied)'}`);
