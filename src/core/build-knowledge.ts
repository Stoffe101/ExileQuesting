export const BUILD_DELIVERY_METHODS = [
  'direct-hit',
  'ailment-dot',
  'non-ailment-dot',
  'trigger',
  'minion',
  'totem',
  'brand',
  'trap',
  'mine',
  'secondary-explosion',
  'self-damage',
] as const;

export const BUILD_SCALING_AXES = [
  'weapon-damage',
  'gem-level',
  'crit',
  'attack-speed',
  'cast-speed',
  'trigger-rate',
  'cooldown-recovery',
  'ailment-duration',
  'dot-multiplier',
  'poison-stack-rate',
  'penetration',
  'resistance-reduction',
  'conversion',
  'projectile-count',
  'projectile-behaviour',
  'charges',
  'attributes',
  'accuracy-stacking',
  'mana-stacking',
  'life-stacking',
  'energy-shield-stacking',
  'armour-stacking',
  'shield-defence',
  'ward',
  'totem-life',
  'reservation-aura-effect',
  'flask-effect',
  'minion-scaling',
  'corpse-scaling',
  'warcry-scaling',
  'quality-scaling',
  'curse-effect',
] as const;

export const BUILD_DEFENCE_LAYERS = [
  'life',
  'energy-shield',
  'mana-as-defence',
  'ward',
  'armour',
  'evasion',
  'suppression',
  'block',
  'max-resistance',
  'endurance-charges',
  'physical-taken-as',
  'generic-damage-reduction',
  'avoidance',
  'leech',
  'regeneration',
  'recoup',
  'recovery-on-block',
  'recovery-on-hit',
  'guard-skill',
  'flask-mitigation',
  'ailment-immunity',
  'curse-mitigation',
  'crit-mitigation',
] as const;

export const BUILD_PLAYSTYLE_TRAITS = [
  'melee',
  'ranged',
  'stationary',
  'mobile',
  'instant-damage',
  'ramping-damage',
  'active-damage',
  'passive-damage',
  'high-coverage',
  'offscreen-capable',
  'high-boss-uptime',
  'low-boss-uptime',
  'rotation-heavy',
  'flask-dependent',
  'charge-dependent',
  'kill-dependent-defence',
  'enemy-hit-dependent',
  'self-hit-dependent',
] as const;

export const BUILD_CONTENT_TARGETS = [
  'campaign',
  'early-maps',
  'general-mapping',
  'eight-mod-mapping',
  'nightmare-maps',
  'pinnacle-bosses',
  'uber-bosses',
  'simulacrum',
  'ultimatum',
  'valdo-maps',
  'delve',
  'ssf',
  'hardcore',
] as const;

export const BUILD_BUDGET_TIERS = [
  'league-start',
  'early-maps',
  'established',
  'high-investment',
  'near-bis',
] as const;

export const KNOWLEDGE_SOURCE_KINDS = [
  'official-docs',
  'official-data',
  'calculation-engine',
  'open-data',
  'creator-guide',
  'creator-video',
  'creator-pob',
  'community-guide',
  'community-pob',
  'synthetic',
] as const;

export const KNOWLEDGE_USE_POLICIES = [
  'official',
  'redistributable',
  'derived-facts-only',
  'link-only',
] as const;

export const KNOWLEDGE_CONFIDENCE = [
  'deterministic',
  'reviewed-expert',
  'corroborated',
  'provisional',
] as const;

export const CORPUS_CASE_KINDS = [
  'build',
  'progression-stage',
  'mutation',
  'content-scenario',
] as const;

export type BuildDeliveryMethod = typeof BUILD_DELIVERY_METHODS[number];
export type BuildScalingAxis = typeof BUILD_SCALING_AXES[number];
export type BuildDefenceLayer = typeof BUILD_DEFENCE_LAYERS[number];
export type BuildPlaystyleTrait = typeof BUILD_PLAYSTYLE_TRAITS[number];
export type BuildContentTarget = typeof BUILD_CONTENT_TARGETS[number];
export type BuildBudgetTier = typeof BUILD_BUDGET_TIERS[number];
export type KnowledgeSourceKind = typeof KNOWLEDGE_SOURCE_KINDS[number];
export type KnowledgeUsePolicy = typeof KNOWLEDGE_USE_POLICIES[number];
export type KnowledgeConfidence = typeof KNOWLEDGE_CONFIDENCE[number];
export type CorpusCaseKind = typeof CORPUS_CASE_KINDS[number];

export interface BuildKnowledgeSource {
  id: string;
  kind: KnowledgeSourceKind;
  title: string;
  url?: string;
  creator?: string;
  patches: string[];
  usePolicy: KnowledgeUsePolicy;
  firstReviewedAt: string;
  lastReviewedAt: string;
  notes?: string;
}

export interface BuildCorpusCase {
  id: string;
  kind: CorpusCaseKind;
  label: string;
  patch: string;
  sourceIds: string[];
  className?: string;
  ascendancy?: string;
  mainSkills: string[];
  deliveryMethods: BuildDeliveryMethod[];
  scalingAxes: BuildScalingAxis[];
  defenceLayers: BuildDefenceLayer[];
  playstyleTraits: BuildPlaystyleTrait[];
  contentTargets: BuildContentTarget[];
  budgetTier?: BuildBudgetTier;
  pobReference?: string;
  parentCaseId?: string;
  mutation?: {
    category: string;
    expectedFailure: string;
  };
  notes?: string;
}

export interface BuildKnowledgeAssertion {
  id: string;
  summary: string;
  sourceIds: string[];
  patches: string[];
  confidence: KnowledgeConfidence;
  mainSkills?: string[];
  deliveryMethods?: BuildDeliveryMethod[];
  scalingAxes?: BuildScalingAxis[];
  defenceLayers?: BuildDefenceLayer[];
  playstyleTraits?: BuildPlaystyleTrait[];
  contentTargets?: BuildContentTarget[];
  caveats?: string[];
}

export interface BuildKnowledgeCorpus {
  schemaVersion: number;
  generatedAt: string;
  sources: BuildKnowledgeSource[];
  cases: BuildCorpusCase[];
  assertions: BuildKnowledgeAssertion[];
}

export interface BuildKnowledgeCoverage {
  totalSources: number;
  totalCases: number;
  totalAssertions: number;
  patches: Record<string, number>;
  sourceKinds: Record<string, number>;
  caseKinds: Record<string, number>;
  deliveryMethods: Record<string, number>;
  scalingAxes: Record<string, number>;
  defenceLayers: Record<string, number>;
  playstyleTraits: Record<string, number>;
  contentTargets: Record<string, number>;
  budgetTiers: Record<string, number>;
}

function count(values: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate];
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validPatch(value: string): boolean {
  return /^\d+\.\d+(?:\.\d+)?$/.test(value) || value === 'historical';
}

function validHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function missingAllowed<T extends readonly string[]>(values: readonly string[], allowed: T): string[] {
  const set = new Set<string>(allowed);
  return values.filter((value) => !set.has(value));
}

export function validateBuildKnowledgeCorpus(corpus: BuildKnowledgeCorpus): string[] {
  const issues: string[] = [];
  if (!Number.isSafeInteger(corpus.schemaVersion) || corpus.schemaVersion < 1) issues.push('schemaVersion must be a positive integer.');
  if (!validIsoDate(corpus.generatedAt)) issues.push('generatedAt must be an ISO-8601 UTC timestamp.');

  for (const id of duplicates(corpus.sources.map((source) => source.id))) issues.push(`Duplicate source id: ${id}`);
  for (const id of duplicates(corpus.cases.map((entry) => entry.id))) issues.push(`Duplicate case id: ${id}`);
  for (const id of duplicates(corpus.assertions.map((assertion) => assertion.id))) issues.push(`Duplicate assertion id: ${id}`);

  const sourceIds = new Set(corpus.sources.map((source) => source.id));
  const caseIds = new Set(corpus.cases.map((entry) => entry.id));

  for (const source of corpus.sources) {
    if (!source.id.trim()) issues.push('Source id cannot be empty.');
    if (!source.title.trim()) issues.push(`Source ${source.id} has an empty title.`);
    if (!KNOWLEDGE_SOURCE_KINDS.includes(source.kind)) issues.push(`Source ${source.id} has invalid kind ${source.kind}.`);
    if (!KNOWLEDGE_USE_POLICIES.includes(source.usePolicy)) issues.push(`Source ${source.id} has invalid use policy ${source.usePolicy}.`);
    if (source.url && !validHttpsUrl(source.url)) issues.push(`Source ${source.id} must use an HTTPS URL.`);
    if (!source.patches.length || source.patches.some((patch) => !validPatch(patch))) issues.push(`Source ${source.id} has invalid patch metadata.`);
    if (!validIsoDate(source.firstReviewedAt) || !validIsoDate(source.lastReviewedAt)) issues.push(`Source ${source.id} has invalid review timestamps.`);
  }

  for (const entry of corpus.cases) {
    if (!entry.id.trim() || !entry.label.trim()) issues.push(`Case ${entry.id || '<empty>'} requires id and label.`);
    if (!validPatch(entry.patch)) issues.push(`Case ${entry.id} has invalid patch ${entry.patch}.`);
    if (!entry.sourceIds.length) issues.push(`Case ${entry.id} must cite at least one source.`);
    for (const sourceId of entry.sourceIds) if (!sourceIds.has(sourceId)) issues.push(`Case ${entry.id} references unknown source ${sourceId}.`);
    if (!entry.mainSkills.length) issues.push(`Case ${entry.id} must identify at least one main skill.`);
    if (!entry.deliveryMethods.length) issues.push(`Case ${entry.id} must identify at least one delivery method.`);
    if (!entry.scalingAxes.length) issues.push(`Case ${entry.id} must identify at least one scaling axis.`);
    if (!entry.defenceLayers.length) issues.push(`Case ${entry.id} must identify at least one defence layer.`);
    if (!entry.playstyleTraits.length) issues.push(`Case ${entry.id} must identify at least one playstyle trait.`);
    if (!entry.contentTargets.length) issues.push(`Case ${entry.id} must identify at least one content target.`);
    for (const value of missingAllowed(entry.deliveryMethods, BUILD_DELIVERY_METHODS)) issues.push(`Case ${entry.id} has unknown delivery method ${value}.`);
    for (const value of missingAllowed(entry.scalingAxes, BUILD_SCALING_AXES)) issues.push(`Case ${entry.id} has unknown scaling axis ${value}.`);
    for (const value of missingAllowed(entry.defenceLayers, BUILD_DEFENCE_LAYERS)) issues.push(`Case ${entry.id} has unknown defence layer ${value}.`);
    for (const value of missingAllowed(entry.playstyleTraits, BUILD_PLAYSTYLE_TRAITS)) issues.push(`Case ${entry.id} has unknown playstyle trait ${value}.`);
    for (const value of missingAllowed(entry.contentTargets, BUILD_CONTENT_TARGETS)) issues.push(`Case ${entry.id} has unknown content target ${value}.`);
    if (entry.budgetTier && !BUILD_BUDGET_TIERS.includes(entry.budgetTier)) issues.push(`Case ${entry.id} has unknown budget tier ${entry.budgetTier}.`);
    if (entry.pobReference && !validHttpsUrl(entry.pobReference)) issues.push(`Case ${entry.id} PoB reference must use HTTPS.`);
    if (entry.parentCaseId && !caseIds.has(entry.parentCaseId)) issues.push(`Case ${entry.id} references unknown parent case ${entry.parentCaseId}.`);
    if (entry.kind === 'mutation' && !entry.mutation) issues.push(`Mutation case ${entry.id} requires mutation metadata.`);
  }

  for (const assertion of corpus.assertions) {
    if (!assertion.id.trim() || !assertion.summary.trim()) issues.push(`Assertion ${assertion.id || '<empty>'} requires id and summary.`);
    if (!assertion.sourceIds.length) issues.push(`Assertion ${assertion.id} must cite at least one source.`);
    for (const sourceId of assertion.sourceIds) if (!sourceIds.has(sourceId)) issues.push(`Assertion ${assertion.id} references unknown source ${sourceId}.`);
    if (!assertion.patches.length || assertion.patches.some((patch) => !validPatch(patch))) issues.push(`Assertion ${assertion.id} has invalid patch metadata.`);
    if (!KNOWLEDGE_CONFIDENCE.includes(assertion.confidence)) issues.push(`Assertion ${assertion.id} has invalid confidence ${assertion.confidence}.`);
  }

  return issues;
}

export function buildKnowledgeCoverage(corpus: BuildKnowledgeCorpus): BuildKnowledgeCoverage {
  return {
    totalSources: corpus.sources.length,
    totalCases: corpus.cases.length,
    totalAssertions: corpus.assertions.length,
    patches: count(corpus.cases.map((entry) => entry.patch)),
    sourceKinds: count(corpus.sources.map((source) => source.kind)),
    caseKinds: count(corpus.cases.map((entry) => entry.kind)),
    deliveryMethods: count(corpus.cases.flatMap((entry) => entry.deliveryMethods)),
    scalingAxes: count(corpus.cases.flatMap((entry) => entry.scalingAxes)),
    defenceLayers: count(corpus.cases.flatMap((entry) => entry.defenceLayers)),
    playstyleTraits: count(corpus.cases.flatMap((entry) => entry.playstyleTraits)),
    contentTargets: count(corpus.cases.flatMap((entry) => entry.contentTargets)),
    budgetTiers: count(corpus.cases.flatMap((entry) => entry.budgetTier ? [entry.budgetTier] : [])),
  };
}

export function uncoveredKnowledgeDimensions(corpus: BuildKnowledgeCorpus): string[] {
  const coverage = buildKnowledgeCoverage(corpus);
  const missing: string[] = [];
  for (const value of BUILD_DELIVERY_METHODS) if (!coverage.deliveryMethods[value]) missing.push(`delivery:${value}`);
  for (const value of BUILD_SCALING_AXES) if (!coverage.scalingAxes[value]) missing.push(`scaling:${value}`);
  for (const value of BUILD_DEFENCE_LAYERS) if (!coverage.defenceLayers[value]) missing.push(`defence:${value}`);
  for (const value of BUILD_PLAYSTYLE_TRAITS) if (!coverage.playstyleTraits[value]) missing.push(`playstyle:${value}`);
  for (const value of BUILD_CONTENT_TARGETS) if (!coverage.contentTargets[value]) missing.push(`content:${value}`);
  return missing;
}
