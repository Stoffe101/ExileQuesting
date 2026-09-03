import { randomUUID } from 'node:crypto';
import {
  candidateItemLabel,
  readyCandidateItemAnalysis,
  unavailableCandidateItemAnalysis,
  type BuildDoctorCandidateItemAnalysis,
} from '../../src/core/build-doctor-candidate-item';
import {
  MAX_POB_PERTURBATION_ITEM_TEXT_BYTES,
  POB_REPLACEABLE_ITEM_SLOTS,
  type PobReplaceableItemSlot,
  type PobWorkerPerturbationSuccess,
  type PobWorkerResponse,
} from '../../src/core/pob-calculation';
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { runPobKernelRequest } from './pob-kernel-service';

function perturbationResponse(response: PobWorkerResponse): PobWorkerPerturbationSuccess {
  if (!response.ok || !('comparison' in response)) throw new Error('PoB worker did not return the requested candidate item comparison.');
  return response as PobWorkerPerturbationSuccess;
}

function validSlot(value: string): value is PobReplaceableItemSlot {
  return POB_REPLACEABLE_ITEM_SLOTS.includes(value as PobReplaceableItemSlot);
}

export async function analyzeBuildDoctorCandidateItem(
  profileId: string,
  slotInput: string,
  itemText: string,
): Promise<BuildDoctorCandidateItemAnalysis> {
  const context = await resolveBuildDoctorCalculationContext(profileId);
  if (!context.ok) {
    return unavailableCandidateItemAnalysis({
      profileId: context.profileId,
      profileName: context.profileName,
      status: 'unavailable',
      message: context.message,
    });
  }

  const { profile, xml, runtimeOptions } = context;
  if (!validSlot(slotInput)) {
    return unavailableCandidateItemAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      message: 'Candidate item comparison requires a supported Path of Building equipment slot.',
    });
  }
  const slot = slotInput;
  const bytes = Buffer.byteLength(itemText, 'utf8');
  if (!itemText.trim() || bytes < 1 || bytes > MAX_POB_PERTURBATION_ITEM_TEXT_BYTES) {
    return unavailableCandidateItemAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      slot,
      message: `Candidate item text must contain a copied Path of Exile item and remain within the ${MAX_POB_PERTURBATION_ITEM_TEXT_BYTES} byte calculation bound.`,
    });
  }

  try {
    const comparison = perturbationResponse(await runPobKernelRequest({
      protocolVersion: 1,
      requestId: `doctor-candidate-item-${randomUUID()}`,
      operation: 'calculate-with-perturbations',
      xml,
      scenario: {
        scenario: 'imported',
        label: `Imported PoB state with candidate ${slot}`,
        notes: ['Single-slot deterministic replacement only; no recommendation score or cost assumption is added.'],
      },
      perturbations: [{ kind: 'replace-item', slot, itemText }],
    }, { ...runtimeOptions, timeoutMs: 45_000 })).comparison;

    return readyCandidateItemAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      slot,
      candidateLabel: candidateItemLabel(itemText),
      comparison,
    });
  } catch (error) {
    return unavailableCandidateItemAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      slot,
      message: `PoB could not calculate this candidate item in ${slot}. No upgrade conclusion was inferred. ${conciseBuildDoctorError(error)}`,
    });
  }
}
