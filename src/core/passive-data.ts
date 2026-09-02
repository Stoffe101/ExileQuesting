export type PassiveNodeKind = 'normal' | 'notable' | 'keystone' | 'mastery' | 'socket' | 'class-start' | 'ascendancy';
export type PassiveTreeScopeKey = 'base' | `ascendancy:${string}`;

export interface PassiveNodeRecord {
  id: number;
  name: string;
  kind: PassiveNodeKind;
  /**
   * Some GGG entries are passive definitions rather than a fixed base-tree
   * instance, for example Cluster Jewel notables and mastery effect choices.
   * They intentionally have no stable group/orbit position.
   */
  dynamic?: boolean;
  /** Tree-space coordinates derived from GGG group/orbit geometry. */
  x?: number;
  y?: number;
  group?: number;
  orbit?: number;
  orbitIndex?: number;
  out?: number[];
  classStartIndex?: number;
  /** Present for GGG-published Ascendancy sub-tree nodes. */
  ascendancyName?: string;
  /** True for the single root node of an Ascendancy sub-tree. */
  ascendancyStart?: boolean;
  icon?: string;
}

export interface PassiveTreeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PassiveTreeSnapshot {
  /**
   * v1 contains node identity only. v2 additionally preserves the geometry and
   * graph information required by Passive Tree HUD. Runtime validation keeps v1
   * readable so older fixtures/caches fail gracefully instead of becoming
   * unusable merely because the HUD was added.
   */
  schemaVersion: 1 | 2;
  gameVersion: string;
  generatedAt: string;
  source: {
    url: string;
    sha256: string;
  };
  nodes: PassiveNodeRecord[];
  bounds?: PassiveTreeBounds;
  skillsPerOrbit?: number[];
  orbitRadii?: number[];
}

export const POE_BASE_CLASSES = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'] as const;
export type PoeBaseClass = typeof POE_BASE_CLASSES[number];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function kind(value: unknown): PassiveNodeKind | null {
  return ['normal', 'notable', 'keystone', 'mastery', 'socket', 'class-start', 'ascendancy'].includes(String(value))
    ? value as PassiveNodeKind
    : null;
}

function finite(value: unknown, min = -100_000, max = 100_000): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function safeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined;
}

function boundedIntegerArray(value: unknown, maxItems: number, min = 0, max = Number.MAX_SAFE_INTEGER): number[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const result: number[] = [];
  for (const candidate of value) {
    const parsed = safeInteger(candidate, min, max);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

function validateBounds(value: unknown): PassiveTreeBounds | undefined {
  const source = record(value);
  if (!source) return undefined;
  const minX = finite(source.minX);
  const minY = finite(source.minY);
  const maxX = finite(source.maxX);
  const maxY = finite(source.maxY);
  if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined || minX >= maxX || minY >= maxY) return undefined;
  return { minX, minY, maxX, maxY };
}

export function validatePassiveTreeSnapshot(value: unknown): PassiveTreeSnapshot | null {
  const source = record(value);
  const sourceInfo = record(source?.source);
  const schemaVersion = source?.schemaVersion === 1 || source?.schemaVersion === 2 ? source.schemaVersion : undefined;
  if (!source || !schemaVersion || typeof source.gameVersion !== 'string' || typeof source.generatedAt !== 'string') return null;
  if (!sourceInfo || typeof sourceInfo.url !== 'string' || typeof sourceInfo.sha256 !== 'string') return null;
  if (!Array.isArray(source.nodes) || source.nodes.length < 1000 || source.nodes.length > 5000) return null;

  const nodes: PassiveNodeRecord[] = [];
  const ids = new Set<number>();
  let staticMainTreeNodes = 0;
  let staticMainTreeGeometryNodes = 0;
  for (const candidate of source.nodes) {
    const node = record(candidate);
    const nodeKind = kind(node?.kind);
    if (!node || !Number.isSafeInteger(node.id) || Number(node.id) <= 0 || typeof node.name !== 'string' || !node.name.trim() || !nodeKind) return null;
    const id = Number(node.id);
    if (ids.has(id)) return null;
    ids.add(id);

    const dynamic = node.dynamic === true;
    if (node.dynamic !== undefined && typeof node.dynamic !== 'boolean') return null;
    const x = node.x === undefined ? undefined : finite(node.x);
    const y = node.y === undefined ? undefined : finite(node.y);
    if ((x === undefined) !== (y === undefined)) return null;
    if ((node.x !== undefined && x === undefined) || (node.y !== undefined && y === undefined)) return null;

    if (nodeKind !== 'ascendancy' && !dynamic) {
      staticMainTreeNodes += 1;
      if (x !== undefined) staticMainTreeGeometryNodes += 1;
    }

    const group = node.group === undefined ? undefined : safeInteger(node.group, 0, 10_000);
    const orbit = node.orbit === undefined ? undefined : safeInteger(node.orbit, 0, 64);
    const orbitIndex = node.orbitIndex === undefined ? undefined : safeInteger(node.orbitIndex, 0, 128);
    const classStartIndex = node.classStartIndex === undefined ? undefined : safeInteger(node.classStartIndex, 0, 32);
    if ((node.group !== undefined && group === undefined)
      || (node.orbit !== undefined && orbit === undefined)
      || (node.orbitIndex !== undefined && orbitIndex === undefined)
      || (node.classStartIndex !== undefined && classStartIndex === undefined)) return null;
    const out = node.out === undefined ? undefined : boundedIntegerArray(node.out, 64, 1);
    if (node.out !== undefined && out === undefined) return null;
    const ascendancyName = node.ascendancyName === undefined
      ? undefined
      : typeof node.ascendancyName === 'string' && node.ascendancyName.trim().length > 0 && node.ascendancyName.length <= 80
        ? node.ascendancyName.trim()
        : undefined;
    if (node.ascendancyName !== undefined && ascendancyName === undefined) return null;
    const ascendancyStart = node.ascendancyStart === true;
    if (node.ascendancyStart !== undefined && typeof node.ascendancyStart !== 'boolean') return null;
    const icon = node.icon === undefined ? undefined : typeof node.icon === 'string' && node.icon.length <= 512 ? node.icon : undefined;
    if (node.icon !== undefined && icon === undefined) return null;

    // A definition declared dynamic must not masquerade as a fixed tree node.
    if (schemaVersion === 2 && dynamic && (x !== undefined || group !== undefined || orbit !== undefined || orbitIndex !== undefined)) return null;
    if (ascendancyStart && nodeKind !== 'ascendancy') return null;
    if (schemaVersion === 2 && nodeKind === 'ascendancy') {
      // GGG's absolute Ascendancy group locations are not useful as a global
      // base-tree layout, but each Ascendancy's local group/orbit geometry is
      // complete and stable enough for scope-local screen registration.
      if (!ascendancyName || x === undefined || y === undefined || group === undefined || orbit === undefined || orbitIndex === undefined) return null;
    }

    nodes.push({
      id,
      name: node.name.trim().slice(0, 160),
      kind: nodeKind,
      ...(dynamic ? { dynamic: true } : {}),
      ...(x === undefined ? {} : { x, y }),
      ...(group === undefined ? {} : { group }),
      ...(orbit === undefined ? {} : { orbit }),
      ...(orbitIndex === undefined ? {} : { orbitIndex }),
      ...(out === undefined ? {} : { out }),
      ...(classStartIndex === undefined ? {} : { classStartIndex }),
      ...(ascendancyName === undefined ? {} : { ascendancyName }),
      ...(ascendancyStart ? { ascendancyStart: true } : {}),
      ...(icon === undefined ? {} : { icon }),
    });
  }

  const bounds = validateBounds(source.bounds);
  const skillsPerOrbit = source.skillsPerOrbit === undefined ? undefined : boundedIntegerArray(source.skillsPerOrbit, 64, 1, 128);
  const orbitRadii = source.orbitRadii === undefined ? undefined : boundedIntegerArray(source.orbitRadii, 64, 0, 10_000);
  if (schemaVersion === 2) {
    // Cluster Jewel/mastery definitions are deliberately dynamic. Every static
    // node in the ordinary base passive tree must still have real GGG geometry.
    if (!bounds || !skillsPerOrbit || !orbitRadii || staticMainTreeNodes < 1000 || staticMainTreeGeometryNodes !== staticMainTreeNodes) return null;
    const classStarts = nodes.filter((node) => node.kind === 'class-start' && !node.dynamic && node.x !== undefined && node.y !== undefined && node.classStartIndex !== undefined);
    const classNames = new Set(classStarts.map((node) => node.name.trim().toLowerCase()));
    const classIndices = new Set(classStarts.map((node) => node.classStartIndex));
    if (classStarts.length !== POE_BASE_CLASSES.length || classIndices.size !== POE_BASE_CLASSES.length
      || POE_BASE_CLASSES.some((name) => !classNames.has(name.toLowerCase()))) return null;

    const ascendancies = new Map<string, { nodes: number; starts: number }>();
    for (const node of nodes.filter((candidate) => candidate.kind === 'ascendancy')) {
      const name = node.ascendancyName!;
      const key = name.toLowerCase();
      const entry = ascendancies.get(key) ?? { nodes: 0, starts: 0 };
      entry.nodes += 1;
      if (node.ascendancyStart) entry.starts += 1;
      ascendancies.set(key, entry);
    }
    // When a v2 snapshot contains Ascendancy data, every exposed sub-tree must
    // have one unambiguous root. Small synthetic fixtures may omit Ascendancies.
    if ([...ascendancies.values()].some((entry) => entry.nodes < 2 || entry.starts !== 1)) return null;
  }

  return {
    schemaVersion,
    gameVersion: source.gameVersion,
    generatedAt: source.generatedAt,
    source: { url: sourceInfo.url, sha256: sourceInfo.sha256 },
    nodes,
    ...(bounds ? { bounds } : {}),
    ...(skillsPerOrbit ? { skillsPerOrbit } : {}),
    ...(orbitRadii ? { orbitRadii } : {}),
  };
}

export function indexPassiveNodes(snapshot: PassiveTreeSnapshot): Map<number, PassiveNodeRecord> {
  return new Map(snapshot.nodes.map((node) => [node.id, node]));
}

export function hasPassiveTreeGeometry(snapshot?: PassiveTreeSnapshot): snapshot is PassiveTreeSnapshot & Required<Pick<PassiveTreeSnapshot, 'bounds' | 'skillsPerOrbit' | 'orbitRadii'>> {
  if (!snapshot || snapshot.schemaVersion !== 2 || !snapshot.bounds || !snapshot.skillsPerOrbit || !snapshot.orbitRadii) return false;
  return snapshot.nodes.some((node) => node.kind !== 'ascendancy' && !node.dynamic && node.x !== undefined && node.y !== undefined);
}

/** Return the local registration scope for any fixed passive-tree node. */
export function passiveNodeScopeKey(node?: PassiveNodeRecord): PassiveTreeScopeKey | undefined {
  if (!node || node.dynamic || node.x === undefined || node.y === undefined) return undefined;
  if (node.kind !== 'ascendancy') return 'base';
  const name = node.ascendancyName?.trim().toLowerCase();
  return name ? `ascendancy:${name}` : undefined;
}

export function passiveAscendancyNameFromScope(scope?: PassiveTreeScopeKey): string | undefined {
  return scope?.startsWith('ascendancy:') ? scope.slice('ascendancy:'.length) : undefined;
}

export function passiveAscendancyStarts(snapshot: PassiveTreeSnapshot): PassiveNodeRecord[] {
  return snapshot.nodes
    .filter((node) => node.kind === 'ascendancy' && node.ascendancyStart === true && passiveNodeScopeKey(node)?.startsWith('ascendancy:'))
    .sort((left, right) => String(left.ascendancyName).localeCompare(String(right.ascendancyName)));
}

export function passiveAscendancyStart(snapshot: PassiveTreeSnapshot, ascendancyName: string): PassiveNodeRecord | undefined {
  const normalized = ascendancyName.trim().toLowerCase();
  return passiveAscendancyStarts(snapshot).find((node) => node.ascendancyName?.toLowerCase() === normalized);
}

function normalizedClassName(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  return POE_BASE_CLASSES.find((candidate) => candidate.toLowerCase() === normalized)?.toLowerCase();
}

/** Return all seven GGG class-start nodes without relying on a hard-coded node ID. */
export function passiveClassStarts(snapshot: PassiveTreeSnapshot): PassiveNodeRecord[] {
  return snapshot.nodes
    .filter((node) => node.kind === 'class-start' && !node.dynamic && node.x !== undefined && node.y !== undefined && node.classStartIndex !== undefined)
    .sort((left, right) => Number(left.classStartIndex) - Number(right.classStartIndex));
}

/**
 * Resolve the starting node for any base class. Class name is preferred because
 * it survives upstream index reshuffles; classId/classStartIndex is a secondary
 * exact signal for PoB data that does not carry a friendly name.
 */
export function passiveClassStart(
  snapshot: PassiveTreeSnapshot,
  selector: { className?: string; classId?: number } = {},
): PassiveNodeRecord | undefined {
  const starts = passiveClassStarts(snapshot);
  const name = normalizedClassName(selector.className);
  if (name) {
    const byName = starts.find((node) => node.name.trim().toLowerCase() === name);
    if (byName) return byName;
  }
  if (Number.isSafeInteger(selector.classId)) {
    const byIndex = starts.find((node) => node.classStartIndex === selector.classId);
    if (byIndex) return byIndex;
  }
  return undefined;
}
