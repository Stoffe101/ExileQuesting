import { readFile, writeFile } from 'node:fs/promises';

const path = 'electron/main.ts';
let source = await readFile(path, 'utf8');
function replaceOnce(before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one main.ts patch target, found ${count}.`);
  source = source.replace(before, after);
}

replaceOnce([
"  const plausibleFreshBind = active.freshStart && !active.characterName && active.progress <= 12",
"    && event.characterLevel !== undefined && event.characterLevel >= 2 && event.characterLevel <= 8",
"    && event.characterLevel <= (active.characterLevel ?? 1) + 1;",
"  if (!plausibleFreshBind) {",
"    log.info(`Ignored named Client.txt level-up for ${name}; it is not proof of the active character.`);",
"    return false;",
"  }",
"  characterCampaign = archiveCharacterProfilesByName(characterCampaign, name, active.id, active.id, now);",
"  const refreshed = characterProfileById(characterCampaign, active.id) ?? active;",
"  characterLevel = event.characterLevel;",
"  characterCampaign = upsertCharacterProfile(characterCampaign, {",
"    ...refreshed, characterName: name, characterClass: event.characterClass, characterLevel: event.characterLevel,",
"    provisional: false, identitySource: 'named-level', identityConfidence: 'inferred',",
"    identityReason: 'Low-level named event matched the protected fresh Act 1 run. Older same-name runs were archived.', updatedAt: now, lastSeenAt: now,",
"  });",
"  await writeActiveCharacterMirrors();",
"  return true;",
].join('\n'), [
"  log.info(`Ignored named Client.txt level-up for ${name}; unknown names never claim an active profile. Confirm the character name in Character Profiles first.`);",
"  return false;",
].join('\n'));

replaceOnce([
"  ipcMain.handle('character:start-new', async () => {",
"    await beginFreshCharacterProfile('Started manually from Character Profiles.', 'manual', 'manual');",
"    broadcastState();",
"    return runtimeState();",
"  });",
"  ipcMain.handle('character:reset', async (_event, id: unknown) => {",
].join('\n'), [
"  ipcMain.handle('character:start-new', async () => {",
"    await beginFreshCharacterProfile('Started manually from Character Profiles.', 'manual', 'manual');",
"    broadcastState();",
"    return runtimeState();",
"  });",
"  ipcMain.handle('character:set-name', async (_event, id: unknown, rawName: unknown) => {",
"    if (typeof id !== 'string' || id.length > 512 || typeof rawName !== 'string') return runtimeState();",
"    const name = rawName.trim();",
"    if (!name || name.length > 64 || /[\\r\\n\\t]/.test(name)) return runtimeState();",
"    const profile = characterProfileById(characterCampaign, id);",
"    if (!profile || profile.archived) return runtimeState();",
"    const now = new Date().toISOString();",
"    characterCampaign = archiveCharacterProfilesByName(characterCampaign, name, profile.id, profile.id, now);",
"    const refreshed = characterProfileById(characterCampaign, profile.id) ?? profile;",
"    characterCampaign = upsertCharacterProfile(characterCampaign, {",
"      ...refreshed, characterName: name, provisional: false, identitySource: 'manual', identityConfidence: 'manual',",
"      identityReason: 'Character name confirmed manually. Named Client.txt level-ups must match this exact name.', updatedAt: now, lastSeenAt: now,",
"    });",
"    if (id === activeCharacterProfileId) characterAmbiguity = undefined;",
"    await saveCharacterCampaign();",
"    broadcastState();",
"    return runtimeState();",
"  });",
"  ipcMain.handle('character:reset', async (_event, id: unknown) => {",
].join('\n'));

await writeFile(path, source, 'utf8');
console.log('Applied strict character-name confirmation patch.');
