// tools/validate-gem-data.ts
import { promises as fs } from "node:fs";
import path from "node:path";

// src/core/gem-data.ts
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function string(value, max = 300) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : void 0;
}
function integer(value, min, max) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : void 0;
}
function validateGemAcquisitionSnapshot(value) {
  const root = record(value);
  if (!root || root.schemaVersion !== 1) return null;
  const source = record(root.source);
  const gameVersion = string(root.gameVersion, 40);
  const generatedAt = string(root.generatedAt, 80);
  if (!source || !gameVersion || !generatedAt) return null;
  const repository = string(source.repository, 200);
  const commit = string(source.commit, 100);
  const license = string(source.license, 80);
  const gemsPath = string(source.gemsPath, 300);
  const questsPath = string(source.questsPath, 300);
  const charactersPath = string(source.charactersPath, 300);
  if (!repository || !commit || !license || !gemsPath || !questsPath || !charactersPath) return null;
  const gems = [];
  if (!Array.isArray(root.gems) || root.gems.length > 5e3) return null;
  for (const candidate of root.gems) {
    const item = record(candidate);
    const id = string(item?.id, 300);
    const name = string(item?.name, 160);
    const primaryAttribute = string(item?.primaryAttribute, 40);
    const requiredLevel = integer(item?.requiredLevel, 0, 100);
    if (!item || !id || !name || !primaryAttribute || requiredLevel === void 0 || typeof item.isSupport !== "boolean") return null;
    gems.push({ id, name, primaryAttribute, requiredLevel, isSupport: item.isSupport });
  }
  const offers = [];
  if (!Array.isArray(root.offers) || root.offers.length > 1e5) return null;
  for (const candidate of root.offers) {
    const item = record(candidate);
    const gemId = string(item?.gemId, 300);
    const kind = item?.kind === "quest" || item?.kind === "vendor" ? item.kind : void 0;
    const questId = string(item?.questId, 100);
    const questName = string(item?.questName, 200);
    const act = integer(item?.act, 1, 10);
    const rewardOfferId = string(item?.rewardOfferId, 100);
    const questNpc = string(item?.questNpc, 160);
    const npc = string(item?.npc, 160);
    const classes = Array.isArray(item?.classes) ? item.classes.filter((entry) => typeof entry === "string" && entry.length <= 80).slice(0, 20) : [];
    if (!item || !gemId || !kind || !questId || !questName || act === void 0 || !rewardOfferId || !questNpc || !npc) return null;
    offers.push({ gemId, kind, questId, questName, act, rewardOfferId, questNpc, npc, classes });
  }
  const startingGems = {};
  const starts = record(root.startingGems);
  if (!starts) return null;
  for (const [className, value2] of Object.entries(starts)) {
    if (className.length > 80 || !Array.isArray(value2)) continue;
    startingGems[className] = value2.filter((entry) => typeof entry === "string" && entry.length <= 300).slice(0, 10);
  }
  const gemIds = /* @__PURE__ */ new Set();
  for (const gem of gems) {
    if (gemIds.has(gem.id)) return null;
    gemIds.add(gem.id);
  }
  const offerKeys = /* @__PURE__ */ new Set();
  for (const offer of offers) {
    if (!gemIds.has(offer.gemId)) return null;
    const key = [offer.gemId, offer.kind, offer.questId, offer.rewardOfferId, offer.npc, [...offer.classes].sort().join(",")].join("|");
    if (offerKeys.has(key)) return null;
    offerKeys.add(key);
  }
  for (const gemIdsForClass of Object.values(startingGems)) {
    if (gemIdsForClass.some((gemId) => !gemIds.has(gemId))) return null;
  }
  return {
    schemaVersion: 1,
    gameVersion,
    generatedAt,
    source: { repository, commit, license, gemsPath, questsPath, charactersPath },
    gems,
    offers,
    startingGems
  };
}

// tools/validate-gem-data.ts
var FILE = path.resolve("assets/game-data/gem-acquisition-3.29.json");
var EXPECTED = {
  gameVersion: "3.29",
  repository: "HeartofPhos/exile-leveling",
  commit: "b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba",
  license: "MIT"
};
async function main() {
  const raw = await fs.readFile(FILE, "utf8");
  const snapshot = validateGemAcquisitionSnapshot(JSON.parse(raw));
  if (!snapshot) throw new Error("Bundled gem acquisition snapshot failed schema validation.");
  if (snapshot.gameVersion !== EXPECTED.gameVersion) throw new Error(`Expected PoE ${EXPECTED.gameVersion} gem data, found ${snapshot.gameVersion}.`);
  if (snapshot.source.repository !== EXPECTED.repository) throw new Error(`Unexpected gem-data source repository: ${snapshot.source.repository}`);
  if (snapshot.source.commit !== EXPECTED.commit) throw new Error(`Unexpected gem-data source commit: ${snapshot.source.commit}`);
  if (snapshot.source.license !== EXPECTED.license) throw new Error(`Unexpected gem-data license: ${snapshot.source.license}`);
  if (snapshot.gems.length < 100) throw new Error(`Gem snapshot is implausibly small (${snapshot.gems.length} records).`);
  if (snapshot.offers.length < 100) throw new Error(`Gem acquisition snapshot is implausibly small (${snapshot.offers.length} offers).`);
  const gemIds = /* @__PURE__ */ new Set();
  for (const gem of snapshot.gems) {
    if (gemIds.has(gem.id)) throw new Error(`Duplicate gem id in bundled snapshot: ${gem.id}`);
    gemIds.add(gem.id);
    if (/^\[(?:DNT|UNUSED)\]/i.test(gem.name.trim())) throw new Error(`Internal/non-player gem leaked into bundled snapshot: ${gem.name}`);
  }
  const offerKeys = /* @__PURE__ */ new Set();
  for (const offer of snapshot.offers) {
    if (!gemIds.has(offer.gemId)) throw new Error(`Acquisition offer references missing gem: ${offer.gemId}`);
    const key = [offer.gemId, offer.kind, offer.questId, offer.rewardOfferId, offer.npc, [...offer.classes].sort().join(",")].join("|");
    if (offerKeys.has(key)) throw new Error(`Duplicate gem acquisition offer: ${key}`);
    offerKeys.add(key);
  }
  for (const [className, starts] of Object.entries(snapshot.startingGems)) {
    for (const gemId of starts) if (!gemIds.has(gemId)) throw new Error(`${className} starting gem is missing from bundled gem records: ${gemId}`);
  }
  console.log(`Bundled PoE ${snapshot.gameVersion} gem data is valid.`);
  console.log(`${snapshot.gems.length} player-acquirable gems \xB7 ${snapshot.offers.length} acquisition offers \xB7 ${Object.keys(snapshot.startingGems).length} character classes`);
  console.log(`Source ${snapshot.source.repository}@${snapshot.source.commit}`);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
