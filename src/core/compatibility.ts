import type { CampaignCompatibilityManifest, CampaignDataset } from './types';

const SAFE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH = /^[A-Za-z0-9_ .\[\]()/+-]+\.json$/;

export function validateCompatibilityManifest(value: unknown): CampaignCompatibilityManifest | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<CampaignCompatibilityManifest>;
  if (input.schemaVersion !== 1 || !input.upstream || typeof input.upstream !== 'object') return null;
  const upstream = input.upstream as CampaignCompatibilityManifest['upstream'];
  if (!SAFE_REPO.test(String(upstream.repository ?? ''))) return null;
  if (!SAFE_PATH.test(String(upstream.guidePath ?? '')) || !SAFE_PATH.test(String(upstream.areasPath ?? ''))) return null;
  if (!Number.isInteger(input.adapterVersion) || !Number.isInteger(input.campaignSchemaVersion)) return null;
  if (typeof input.updatedAt !== 'string') return null;
  if (upstream.supportedCommit && !/^[a-f0-9]{7,40}$/i.test(upstream.supportedCommit)) return null;
  return input as CampaignCompatibilityManifest;
}

export interface SemanticCampaignDiff {
  added: string[];
  removed: string[];
  changedActs: Array<{ act: number; before: number; after: number }>;
  unchangedSteps: number;
}

export function semanticCampaignDiff(before: CampaignDataset, after: CampaignDataset): SemanticCampaignDiff {
  const beforeById = new Map(before.steps.map((step) => [step.id, step]));
  const afterById = new Map(after.steps.map((step) => [step.id, step]));
  const added = after.steps.filter((step) => !beforeById.has(step.id)).map((step) => step.id);
  const removed = before.steps.filter((step) => !afterById.has(step.id)).map((step) => step.id);
  const changedActs = Array.from({ length: 10 }, (_, index) => index + 1)
    .map((act) => ({
      act,
      before: before.steps.filter((step) => step.act === act).length,
      after: after.steps.filter((step) => step.act === act).length,
    }))
    .filter((entry) => entry.before !== entry.after);
  return {
    added,
    removed,
    changedActs,
    unchangedSteps: Math.max(0, after.steps.length - added.length),
  };
}
