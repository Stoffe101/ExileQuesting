// Temporary guarded patcher. Delete before opening the v0.2 pull request.
import fs from 'node:fs';

const file = 'electron/main.ts';
let text = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  text = text.replace(before, after);
}

replaceOnce(
  "import { isMaxrollGuideUrl } from '../src/core/maxroll';\n",
  "import { isMaxrollGuideUrl } from '../src/core/maxroll';\nimport { analyzeGearItem, type GearCoachAnalysis } from '../src/core/gear-coach';\nimport { MAX_POB_XML_BYTES } from '../src/core/pob';\n",
  'imports',
);

replaceOnce(
  "    plan: activeGemPlan,\n    coach: activeBuildCoach,\n    lootFilter,\n",
  "    plan: activeGemPlan,\n    coach: activeBuildCoach,\n    characterLevel,\n    lootFilter,\n",
  'workspace character level',
);

const registerMarker = 'function registerIpc(): void {';
const registerIndex = text.indexOf(registerMarker);
if (registerIndex < 0) throw new Error('registerIpc marker missing');
const helpers = `async function importBuildProfileInput(input: string, sourceOverride?: string): Promise<BuildProfile[]> {\n  let profile: BuildProfile;\n  if (isMaxrollGuideUrl(input.trim())) {\n    const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot);\n    profile = { ...imported, name: imported.maxroll.guideTitle };\n  } else {\n    const imported = await importPobBuild(input, app.getVersion());\n    profile = { ...imported, name: defaultBuildProfileName(imported.build), source: sourceOverride ?? imported.source };\n  }\n  buildProfiles = upsertBuildProfile(buildProfiles, profile);\n  buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);\n  rebuildBuildGuidance();\n  await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n  await refreshBuildLootFilter();\n  broadcastState();\n  return buildProfiles;\n}\n\nfunction analyzeActiveGear(input: string): GearCoachAnalysis {\n  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);\n  if (!activeProfile) throw new Error('Select or import a Build Profile before using Gear Coach.');\n  if (!gemData.snapshot) throw new Error('Bundled gem data is unavailable, so Gear Coach cannot build a stage-aware score.');\n  const activeStageId = buildPlannerState.activeStageByProfile[activeProfile.id];\n  return analyzeGearItem(input, activeProfile, activeStageId, gemData.snapshot, characterLevel);\n}\n\n`;
text = `${text.slice(0, registerIndex)}${helpers}${text.slice(registerIndex)}`;

const oldImport = `  ipcMain.handle('pob:import', async (_event, input: unknown) => {\n    if (typeof input !== 'string') throw new Error('Build input must be text.');\n    let profile: BuildProfile;\n    if (isMaxrollGuideUrl(input.trim())) {\n      const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot);\n      profile = { ...imported, name: imported.maxroll.guideTitle };\n    } else {\n      const imported = await importPobBuild(input, app.getVersion());\n      profile = { ...imported, name: defaultBuildProfileName(imported.build) };\n    }\n    buildProfiles = upsertBuildProfile(buildProfiles, profile);\n    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);\n    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildProfiles;\n  });`;
const newImport = `  ipcMain.handle('pob:import', async (_event, input: unknown) => {\n    if (typeof input !== 'string') throw new Error('Build input must be text.');\n    return importBuildProfileInput(input);\n  });\n  ipcMain.handle('pob:select-xml', async () => {\n    const options: Electron.OpenDialogOptions = { title: 'Open Path of Building XML', properties: ['openFile'], filters: [{ name: 'Path of Building XML', extensions: ['xml'] }] };\n    const selected = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);\n    if (selected.canceled || !selected.filePaths[0]) return buildWorkspaceSnapshot();\n    const selectedPath = selected.filePaths[0];\n    const stat = await fs.stat(selectedPath);\n    if (!stat.isFile()) throw new Error('Selected PoB XML path is not a file.');\n    if (stat.size > MAX_POB_XML_BYTES) throw new Error('Selected PoB XML exceeds the safety size limit.');\n    const xml = await fs.readFile(selectedPath, 'utf8');\n    await importBuildProfileInput(xml, selectedPath);\n    return buildWorkspaceSnapshot();\n  });\n  ipcMain.handle('gear:analyze', (_event, input: unknown) => {\n    if (typeof input !== 'string') throw new Error('Gear Coach item input must be text.');\n    return analyzeActiveGear(input);\n  });\n  ipcMain.handle('gear:analyze-clipboard', () => {\n    const input = clipboard.readText();\n    if (!input.trim()) throw new Error('Clipboard is empty. Hover an item in Path of Exile and press Ctrl+C first.');\n    return analyzeActiveGear(input);\n  });`;
replaceOnce(oldImport, newImport, 'build import handler');

fs.writeFileSync(file, text);
