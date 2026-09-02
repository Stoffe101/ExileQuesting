import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

const path = 'electron/main.ts';
let source = await readFile(path, 'utf8');

source = replaceOnce(
  source,
  "import { isAllowedDataUrl, isAllowedExternalUrl, MAX_REMOTE_JSON_BYTES, readBoundedResponseText } from '../src/core/security';",
  "import { isAllowedDataUrl, isAllowedExternalUrl, MAX_REMOTE_JSON_BYTES, readBoundedResponseText } from '../src/core/security';\nimport { isMaxrollGuideUrl } from '../src/core/maxroll';",
  'maxroll core import',
);
source = replaceOnce(
  source,
  "import { importPobBuild } from './services/pob-service';",
  "import { importPobBuild } from './services/pob-service';\nimport { importMaxrollGuide } from './services/maxroll-service';",
  'maxroll service import',
);
source = replaceOnce(
  source,
  "import { activateBuildProfile, activateBuildStage, buildPlannerSnapshot, normalizeBuildPlannerState, type BuildPlannerState } from '../src/core/build-planner';",
  "import { activateBuildProfile, activateBuildStage, activateMaxrollStageForLevel, buildPlannerSnapshot, normalizeBuildPlannerState, stepBuildPassiveCursor, type BuildPlannerState } from '../src/core/build-planner';",
  'build planner imports',
);
source = replaceOnce(
  source,
  "let buildPlannerState: BuildPlannerState = { schemaVersion: 1, activeStageByProfile: {} };",
  "let buildPlannerState: BuildPlannerState = { schemaVersion: 1, activeStageByProfile: {}, passiveCursorByProfile: {} };",
  'planner state default',
);

const oldRebuild = `function rebuildBuildGuidance(): void {
  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
  campaignIntelligence = buildCampaignIntelligence(dataset);
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;
  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;
  const activeStageId = activeProfile ? buildPlannerState.activeStageByProfile[activeProfile.id] : undefined;
  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot
    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot)
    : undefined;
}`;
const newRebuild = `function rebuildBuildGuidance(): void {
  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
  campaignIntelligence = buildCampaignIntelligence(dataset);
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  if (activeProfile?.maxroll && characterLevel) {
    buildPlannerState = activateMaxrollStageForLevel(buildPlannerState, buildProfiles, activeProfile.id, characterLevel);
  }
  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;
  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;
  const activeStageId = activeProfile ? buildPlannerState.activeStageByProfile[activeProfile.id] : undefined;
  const passiveCursor = activeProfile ? buildPlannerState.passiveCursorByProfile[activeProfile.id] ?? 0 : 0;
  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot
    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor)
    : undefined;
}`;
source = replaceOnce(source, oldRebuild, newRebuild, 'rebuild build guidance');

source = replaceOnce(
  source,
  `  updateCurrentArea(event);\n  await updateRunFromZone(event);`,
  `  updateCurrentArea(event);\n  if (event.type === 'character-level') {\n    rebuildBuildGuidance();\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n  }\n  await updateRunFromZone(event);`,
  'character level build sync',
);

source = replaceOnce(
  source,
  "  ipcMain.handle('pob:list', () => buildProfiles);",
  `  ipcMain.handle('build:passive-step', async (_event, profileId: unknown, delta: unknown) => {
    if (typeof profileId !== 'string' || profileId.length > 256) return buildWorkspaceSnapshot();
    const direction = Math.sign(Number(delta));
    if (!Number.isFinite(direction) || direction === 0) return buildWorkspaceSnapshot();
    buildPlannerState = stepBuildPassiveCursor(buildPlannerState, buildProfiles, profileId, direction);
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('pob:list', () => buildProfiles);`,
  'passive cursor ipc',
);

const oldImport = `  ipcMain.handle('pob:import', async (_event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('PoB input must be text.');
    const imported = await importPobBuild(input, app.getVersion());
    const profile: BuildProfile = { ...imported, name: defaultBuildProfileName(imported.build) };
    buildProfiles = upsertBuildProfile(buildProfiles, profile);
    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
    await refreshBuildLootFilter();
    broadcastState();
    return buildProfiles;
  });`;
const newImport = `  ipcMain.handle('pob:import', async (_event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('Build input must be text.');
    let profile: BuildProfile;
    if (isMaxrollGuideUrl(input.trim())) {
      const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot);
      profile = { ...imported, name: imported.maxroll.guideTitle };
    } else {
      const imported = await importPobBuild(input, app.getVersion());
      profile = { ...imported, name: defaultBuildProfileName(imported.build) };
    }
    buildProfiles = upsertBuildProfile(buildProfiles, profile);
    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
    await refreshBuildLootFilter();
    broadcastState();
    return buildProfiles;
  });`;
source = replaceOnce(source, oldImport, newImport, 'build import handler');

await writeFile(path, source, 'utf8');
console.log('Applied Maxroll main-process integration.');
