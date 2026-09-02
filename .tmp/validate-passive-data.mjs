// tools/validate-passive-data.ts
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// src/core/passive-data.ts
var POE_BASE_CLASSES = ["Scion", "Marauder", "Ranger", "Witch", "Duelist", "Templar", "Shadow"];
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function kind(value) {
  return ["normal", "notable", "keystone", "mastery", "socket", "class-start", "ascendancy"].includes(String(value)) ? value : null;
}
function finite(value, min = -1e5, max = 1e5) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : void 0;
}
function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : void 0;
}
function boundedIntegerArray(value, maxItems, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value) || value.length > maxItems) return void 0;
  const result = [];
  for (const candidate of value) {
    const parsed = safeInteger(candidate, min, max);
    if (parsed === void 0) return void 0;
    result.push(parsed);
  }
  return result;
}
function validateBounds(value) {
  const source = record(value);
  if (!source) return void 0;
  const minX = finite(source.minX);
  const minY = finite(source.minY);
  const maxX = finite(source.maxX);
  const maxY = finite(source.maxY);
  if (minX === void 0 || minY === void 0 || maxX === void 0 || maxY === void 0 || minX >= maxX || minY >= maxY) return void 0;
  return { minX, minY, maxX, maxY };
}
function validatePassiveTreeSnapshot(value) {
  const source = record(value);
  const sourceInfo = record(source?.source);
  const schemaVersion = source?.schemaVersion === 1 || source?.schemaVersion === 2 ? source.schemaVersion : void 0;
  if (!source || !schemaVersion || typeof source.gameVersion !== "string" || typeof source.generatedAt !== "string") return null;
  if (!sourceInfo || typeof sourceInfo.url !== "string" || typeof sourceInfo.sha256 !== "string") return null;
  if (!Array.isArray(source.nodes) || source.nodes.length < 1e3 || source.nodes.length > 5e3) return null;
  const nodes = [];
  const ids = /* @__PURE__ */ new Set();
  let staticMainTreeNodes = 0;
  let staticMainTreeGeometryNodes = 0;
  for (const candidate of source.nodes) {
    const node = record(candidate);
    const nodeKind = kind(node?.kind);
    if (!node || !Number.isSafeInteger(node.id) || Number(node.id) <= 0 || typeof node.name !== "string" || !node.name.trim() || !nodeKind) return null;
    const id = Number(node.id);
    if (ids.has(id)) return null;
    ids.add(id);
    const dynamic = node.dynamic === true;
    if (node.dynamic !== void 0 && typeof node.dynamic !== "boolean") return null;
    const x = node.x === void 0 ? void 0 : finite(node.x);
    const y = node.y === void 0 ? void 0 : finite(node.y);
    if (x === void 0 !== (y === void 0)) return null;
    if (node.x !== void 0 && x === void 0 || node.y !== void 0 && y === void 0) return null;
    if (nodeKind !== "ascendancy" && !dynamic) {
      staticMainTreeNodes += 1;
      if (x !== void 0) staticMainTreeGeometryNodes += 1;
    }
    const group = node.group === void 0 ? void 0 : safeInteger(node.group, 0, 1e4);
    const orbit = node.orbit === void 0 ? void 0 : safeInteger(node.orbit, 0, 64);
    const orbitIndex = node.orbitIndex === void 0 ? void 0 : safeInteger(node.orbitIndex, 0, 128);
    const classStartIndex = node.classStartIndex === void 0 ? void 0 : safeInteger(node.classStartIndex, 0, 32);
    if (node.group !== void 0 && group === void 0 || node.orbit !== void 0 && orbit === void 0 || node.orbitIndex !== void 0 && orbitIndex === void 0 || node.classStartIndex !== void 0 && classStartIndex === void 0) return null;
    const out = node.out === void 0 ? void 0 : boundedIntegerArray(node.out, 64, 1);
    if (node.out !== void 0 && out === void 0) return null;
    const ascendancyName = node.ascendancyName === void 0 ? void 0 : typeof node.ascendancyName === "string" && node.ascendancyName.trim().length > 0 && node.ascendancyName.length <= 80 ? node.ascendancyName.trim() : void 0;
    if (node.ascendancyName !== void 0 && ascendancyName === void 0) return null;
    const ascendancyStart = node.ascendancyStart === true;
    if (node.ascendancyStart !== void 0 && typeof node.ascendancyStart !== "boolean") return null;
    const icon = node.icon === void 0 ? void 0 : typeof node.icon === "string" && node.icon.length <= 512 ? node.icon : void 0;
    if (node.icon !== void 0 && icon === void 0) return null;
    if (schemaVersion === 2 && dynamic && (x !== void 0 || group !== void 0 || orbit !== void 0 || orbitIndex !== void 0)) return null;
    if (ascendancyStart && nodeKind !== "ascendancy") return null;
    if (schemaVersion === 2 && nodeKind === "ascendancy") {
      if (!ascendancyName || x === void 0 || y === void 0 || group === void 0 || orbit === void 0 || orbitIndex === void 0) return null;
    }
    nodes.push({
      id,
      name: node.name.trim().slice(0, 160),
      kind: nodeKind,
      ...dynamic ? { dynamic: true } : {},
      ...x === void 0 ? {} : { x, y },
      ...group === void 0 ? {} : { group },
      ...orbit === void 0 ? {} : { orbit },
      ...orbitIndex === void 0 ? {} : { orbitIndex },
      ...out === void 0 ? {} : { out },
      ...classStartIndex === void 0 ? {} : { classStartIndex },
      ...ascendancyName === void 0 ? {} : { ascendancyName },
      ...ascendancyStart ? { ascendancyStart: true } : {},
      ...icon === void 0 ? {} : { icon }
    });
  }
  const bounds = validateBounds(source.bounds);
  const skillsPerOrbit = source.skillsPerOrbit === void 0 ? void 0 : boundedIntegerArray(source.skillsPerOrbit, 64, 1, 128);
  const orbitRadii = source.orbitRadii === void 0 ? void 0 : boundedIntegerArray(source.orbitRadii, 64, 0, 1e4);
  if (schemaVersion === 2) {
    if (!bounds || !skillsPerOrbit || !orbitRadii || staticMainTreeNodes < 1e3 || staticMainTreeGeometryNodes !== staticMainTreeNodes) return null;
    const classStarts = nodes.filter((node) => node.kind === "class-start" && !node.dynamic && node.x !== void 0 && node.y !== void 0 && node.classStartIndex !== void 0);
    const classNames = new Set(classStarts.map((node) => node.name.trim().toLowerCase()));
    const classIndices = new Set(classStarts.map((node) => node.classStartIndex));
    if (classStarts.length !== POE_BASE_CLASSES.length || classIndices.size !== POE_BASE_CLASSES.length || POE_BASE_CLASSES.some((name) => !classNames.has(name.toLowerCase()))) return null;
    const ascendancies = /* @__PURE__ */ new Map();
    for (const node of nodes.filter((candidate) => candidate.kind === "ascendancy")) {
      const name = node.ascendancyName;
      const key = name.toLowerCase();
      const entry = ascendancies.get(key) ?? { nodes: 0, starts: 0 };
      entry.nodes += 1;
      if (node.ascendancyStart) entry.starts += 1;
      ascendancies.set(key, entry);
    }
    if ([...ascendancies.values()].some((entry) => entry.nodes < 2 || entry.starts !== 1)) return null;
  }
  return {
    schemaVersion,
    gameVersion: source.gameVersion,
    generatedAt: source.generatedAt,
    source: { url: sourceInfo.url, sha256: sourceInfo.sha256 },
    nodes,
    ...bounds ? { bounds } : {},
    ...skillsPerOrbit ? { skillsPerOrbit } : {},
    ...orbitRadii ? { orbitRadii } : {}
  };
}
function passiveNodeScopeKey(node) {
  if (!node || node.dynamic || node.x === void 0 || node.y === void 0) return void 0;
  if (node.kind !== "ascendancy") return "base";
  const name = node.ascendancyName?.trim().toLowerCase();
  return name ? `ascendancy:${name}` : void 0;
}
function passiveAscendancyStarts(snapshot2) {
  return snapshot2.nodes.filter((node) => node.kind === "ascendancy" && node.ascendancyStart === true && passiveNodeScopeKey(node)?.startsWith("ascendancy:")).sort((left, right) => String(left.ascendancyName).localeCompare(String(right.ascendancyName)));
}

// tools/validate-passive-data.ts
var filePath = path.join(process.cwd(), "assets", "game-data", "passive-tree-3.29.json");
var raw = await fs.readFile(filePath, "utf8");
var snapshot = validatePassiveTreeSnapshot(JSON.parse(raw));
if (!snapshot) throw new Error("Passive tree snapshot failed schema validation.");
var sha256 = createHash("sha256").update(JSON.stringify(snapshot.nodes)).digest("hex");
if (sha256 !== snapshot.source.sha256) throw new Error(`Passive tree checksum mismatch: expected ${snapshot.source.sha256}, calculated ${sha256}.`);
if (snapshot.gameVersion !== "3.29") throw new Error(`Expected PoE 3.29 passive tree data, received ${snapshot.gameVersion}.`);
var namedMilestones = snapshot.nodes.filter((node) => node.kind === "notable" || node.kind === "keystone");
if (namedMilestones.length < 200) throw new Error(`Passive snapshot contains suspiciously few notable/keystone nodes (${namedMilestones.length}).`);
var ascendancyNodes = snapshot.nodes.filter((node) => node.kind === "ascendancy");
var ascendancyStarts = passiveAscendancyStarts(snapshot);
if (ascendancyNodes.length < 300 || ascendancyStarts.length < 18) {
  throw new Error(`Passive snapshot contains suspiciously little Ascendancy geometry (${ascendancyNodes.length} nodes, ${ascendancyStarts.length} roots).`);
}
if (ascendancyNodes.some((node) => !node.ascendancyName || node.x === void 0 || node.y === void 0)) {
  throw new Error("At least one bundled Ascendancy node is missing fixed local geometry or scope identity.");
}
console.log(`Passive tree snapshot OK: ${snapshot.nodes.length} nodes, ${namedMilestones.length} notable/keystone targets, ${ascendancyNodes.length} Ascendancy nodes across ${ascendancyStarts.length} scopes, ${sha256.slice(0, 12)}.`);
