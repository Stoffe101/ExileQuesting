// tools/generate-passive-data.ts
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
var GAME_VERSION = "3.29";
var SOURCE_URL = "https://www.pathofexile.com/passive-skill-tree";
var OUTPUT = path.join(process.cwd(), "assets", "game-data", "passive-tree-3.29.json");
var SIXTEEN_ORBIT_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
var FORTY_ORBIT_ANGLES = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350];
function extractAssignedObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Could not find ${marker} in passive tree response.`);
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error(`Could not find object start after ${marker}.`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error(`Could not find object end after ${marker}.`);
}
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function nodeKind(node) {
  if (node.isAscendancyStart || typeof node.ascendancyName === "string") return "ascendancy";
  if (node.classStartIndex !== void 0) return "class-start";
  if (node.isKeystone) return "keystone";
  if (node.isNotable) return "notable";
  if (node.isMastery) return "mastery";
  if (node.isJewelSocket) return "socket";
  return "normal";
}
function numberArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter((candidate) => Number.isFinite(candidate));
}
function orbitAngleRadians(skillsOnOrbit, orbitIndex) {
  const degrees = skillsOnOrbit === 16 ? SIXTEEN_ORBIT_ANGLES[orbitIndex] : skillsOnOrbit === 40 ? FORTY_ORBIT_ANGLES[orbitIndex] : skillsOnOrbit > 0 ? orbitIndex * (360 / skillsOnOrbit) : void 0;
  if (degrees === void 0) throw new Error(`Invalid orbit index ${orbitIndex} for orbit with ${skillsOnOrbit} slots.`);
  return degrees * Math.PI / 180;
}
function nodePosition(node, groups, skillsPerOrbit, orbitRadii) {
  const groupId = Number(node.group);
  const orbit = Number(node.orbit);
  const orbitIndex = Number(node.orbitIndex);
  if (!Number.isInteger(groupId) || !Number.isInteger(orbit) || !Number.isInteger(orbitIndex)) return void 0;
  const group = record(groups[String(groupId)]);
  const groupX = Number(group.x);
  const groupY = Number(group.y);
  const radius = orbitRadii[orbit];
  const skillsOnOrbit = skillsPerOrbit[orbit];
  if (![groupX, groupY, radius, skillsOnOrbit].every(Number.isFinite) || !skillsOnOrbit) return void 0;
  const angle = orbitAngleRadians(skillsOnOrbit, orbitIndex);
  return {
    x: groupX + Math.sin(angle) * radius,
    y: groupY - Math.cos(angle) * radius
  };
}
function treeBounds(tree, nodes) {
  const minX = Number(tree.min_x);
  const minY = Number(tree.min_y);
  const maxX = Number(tree.max_x);
  const maxY = Number(tree.max_y);
  if ([minX, minY, maxX, maxY].every(Number.isFinite) && minX < maxX && minY < maxY) return { minX, minY, maxX, maxY };
  const positioned = nodes.filter((node) => node.kind !== "ascendancy" && node.x !== void 0 && node.y !== void 0);
  if (!positioned.length) throw new Error("Passive tree contained no usable base-tree geometry.");
  return {
    minX: Math.min(...positioned.map((node) => node.x)),
    minY: Math.min(...positioned.map((node) => node.y)),
    maxX: Math.max(...positioned.map((node) => node.x)),
    maxY: Math.max(...positioned.map((node) => node.y))
  };
}
async function existingGeneratedAt(sha256) {
  try {
    const existing = JSON.parse(await fs.readFile(OUTPUT, "utf8"));
    if (existing.source?.sha256 === sha256 && existing.gameVersion === GAME_VERSION && typeof existing.generatedAt === "string") return existing.generatedAt;
  } catch {
  }
  return void 0;
}
function canonicalClassNames(tree) {
  if (!Array.isArray(tree.classes)) throw new Error("Passive tree did not expose its class table.");
  const names = /* @__PURE__ */ new Map();
  for (let index = 0; index < tree.classes.length; index += 1) {
    const entry = record(tree.classes[index]);
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name) names.set(index, name);
  }
  if (names.size !== 7) throw new Error(`Expected seven base classes, found ${names.size}.`);
  return names;
}
async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "ExileQuesting passive-data generator (github.com/Stoffe101/ExileQuesting)" },
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) throw new Error(`Passive tree endpoint returned HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length < 1e5 || html.length > 2e7) throw new Error(`Passive tree response had suspicious size ${html.length}.`);
  const tree = record(extractAssignedObject(html, "var passiveSkillTreeData"));
  const rawNodes = record(tree.nodes);
  const groups = record(tree.groups);
  const constants = record(tree.constants);
  const skillsPerOrbit = numberArray(constants.skillsPerOrbit).map(Math.trunc);
  const orbitRadii = numberArray(constants.orbitRadii);
  const classNames = canonicalClassNames(tree);
  if (!skillsPerOrbit.length || skillsPerOrbit.length !== orbitRadii.length) throw new Error("Passive tree orbit constants were missing or inconsistent.");
  const nodes = [];
  for (const [key, raw] of Object.entries(rawNodes)) {
    const node = record(raw);
    const id = Number(node.skill ?? key);
    const kind = nodeKind(node);
    const classStartIndex = Number(node.classStartIndex);
    const rawName = typeof node.name === "string" ? node.name.trim() : "";
    const name = kind === "class-start" && Number.isSafeInteger(classStartIndex) ? classNames.get(classStartIndex) ?? rawName : rawName;
    if (!Number.isSafeInteger(id) || id <= 0 || !name) continue;
    const position = nodePosition(node, groups, skillsPerOrbit, orbitRadii);
    const rawGroupPresent = node.group !== void 0;
    const rawOrbitPresent = node.orbit !== void 0;
    const rawOrbitIndexPresent = node.orbitIndex !== void 0;
    const hasNoPlacementFields = !rawGroupPresent && !rawOrbitPresent && !rawOrbitIndexPresent;
    const dynamic = kind !== "ascendancy" && !position && hasNoPlacementFields;
    if (kind !== "ascendancy" && !position && !dynamic) {
      throw new Error(`Static passive ${id} (${name}) had incomplete or invalid group/orbit geometry.`);
    }
    if (kind === "ascendancy" && !position) {
      throw new Error(`Ascendancy passive ${id} (${name}) had incomplete or invalid local group/orbit geometry.`);
    }
    const group = Number(node.group);
    const orbit = Number(node.orbit);
    const orbitIndex = Number(node.orbitIndex);
    const out = Array.isArray(node.out) ? node.out.map(Number).filter((candidate) => Number.isSafeInteger(candidate) && candidate > 0) : [];
    const ascendancyName = typeof node.ascendancyName === "string" ? node.ascendancyName.trim() : void 0;
    const ascendancyStart = node.isAscendancyStart === true;
    const icon = typeof node.icon === "string" ? node.icon : void 0;
    nodes.push({
      id,
      name,
      kind,
      ...dynamic ? { dynamic: true } : {},
      ...position ?? {},
      ...Number.isSafeInteger(group) ? { group } : {},
      ...Number.isSafeInteger(orbit) ? { orbit } : {},
      ...Number.isSafeInteger(orbitIndex) ? { orbitIndex } : {},
      ...out.length ? { out } : {},
      ...Number.isSafeInteger(classStartIndex) && classStartIndex >= 0 ? { classStartIndex } : {},
      ...ascendancyName ? { ascendancyName } : {},
      ...ascendancyStart ? { ascendancyStart: true } : {},
      ...icon ? { icon } : {}
    });
  }
  nodes.sort((left, right) => left.id - right.id);
  if (nodes.length < 1e3) throw new Error(`Only ${nodes.length} passive nodes were extracted.`);
  const staticMainTree = nodes.filter((node) => node.kind !== "ascendancy" && !node.dynamic);
  const staticMainTreeGeometry = staticMainTree.filter((node) => node.x !== void 0 && node.y !== void 0);
  if (staticMainTreeGeometry.length !== staticMainTree.length) throw new Error(`Only ${staticMainTreeGeometry.length}/${staticMainTree.length} static main-tree passive nodes had geometry.`);
  const classStarts = nodes.filter((node) => node.kind === "class-start");
  if (classStarts.length !== classNames.size) throw new Error(`Expected ${classNames.size} class starts, extracted ${classStarts.length}.`);
  const dynamicCount = nodes.filter((node) => node.dynamic).length;
  const ascendancyNodes = nodes.filter((node) => node.kind === "ascendancy");
  const ascendancyNames = /* @__PURE__ */ new Map();
  for (const node of ascendancyNodes) {
    if (!node.ascendancyName || node.x === void 0 || node.y === void 0) throw new Error(`Ascendancy node ${node.id} is missing local scope geometry.`);
    const entry = ascendancyNames.get(node.ascendancyName) ?? { nodes: 0, starts: 0 };
    entry.nodes += 1;
    if (node.ascendancyStart) entry.starts += 1;
    ascendancyNames.set(node.ascendancyName, entry);
  }
  if (ascendancyNodes.length < 300 || ascendancyNames.size < 18) {
    throw new Error(`Passive tree exposed suspiciously little Ascendancy data (${ascendancyNodes.length} nodes, ${ascendancyNames.size} scopes).`);
  }
  for (const [ascendancyName, entry] of ascendancyNames) {
    if (entry.starts !== 1 || entry.nodes < 2) throw new Error(`${ascendancyName} exposed ${entry.nodes} nodes and ${entry.starts} start nodes.`);
  }
  const normalizedPayload = JSON.stringify(nodes);
  const sha256 = createHash("sha256").update(normalizedPayload).digest("hex");
  const snapshot = {
    schemaVersion: 2,
    gameVersion: GAME_VERSION,
    generatedAt: await existingGeneratedAt(sha256) ?? (/* @__PURE__ */ new Date()).toISOString(),
    source: { url: SOURCE_URL, sha256 },
    nodes,
    bounds: treeBounds(tree, nodes),
    skillsPerOrbit,
    orbitRadii
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}
`, "utf8");
  console.log(`Generated ${OUTPUT} with ${nodes.length} nodes; ${staticMainTree.length} static main-tree nodes positioned; ${dynamicCount} dynamic definitions; ${classStarts.length} canonical class starts; ${ascendancyNodes.length} Ascendancy nodes across ${ascendancyNames.size} local scopes (${sha256.slice(0, 12)}).`);
}
await main();
